import { createReadStream, existsSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, resolve } from "node:path";

import { collectSite, discoverSiteResult, type DiscoveryResult, type SiteTarget, type SkippedSite } from "./collector.ts";
import { SnapshotStore, type StoredSnapshot } from "./store.ts";

const UI_DIR = resolve(import.meta.dirname, "../frontend/dist");

const ASSET_CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const UI_MISSING_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><title>PT Monitor</title></head>
<body style="font-family:ui-sans-serif,system-ui,sans-serif;background:#0b0d10;color:#eef2f7;display:flex;justify-content:center;padding-top:80px">
<main style="max-width:640px;padding:0 24px"><h1>PT Monitor</h1>
<p style="color:#9199a5">The web UI has not been built yet.</p>
<pre style="background:#111419;border:1px solid #222832;border-radius:12px;padding:16px;overflow:auto">pnpm ui:build</pre>
<p style="color:#9199a5">API endpoints are still available at <code>/api/health</code>, <code>/api/sites</code>, and <code>/api/collect</code>.</p>
</main></body></html>`;

export interface ServeOptions {
  prowlarrDb: string;
  stateDb: string;
  sites?: string[];
  listen?: string;
  port?: number;
  intervalMinutes?: number;
  timeoutMs?: number;
  userAgent?: string;
  flaresolverrUrl?: string;
  flaresolverrTimeoutMs?: number;
  debug?: boolean;
}

type DiscoveryStatus = "ready" | "error" | "disabled";

interface DiscoveryError {
  code: "discovery-failed";
  detail: string;
}

export interface DiscoveryMeta {
  status: DiscoveryStatus;
  updatedAt: string | null;
  error?: DiscoveryError;
}

export interface DiscoveryState {
  targets: SiteTarget[];
  skipped: SkippedSite[];
  discovery: DiscoveryMeta;
}

class DiscoveryRefreshError extends Error {
  readonly status = 503;

  constructor(readonly detail: string) {
    super(detail);
    this.name = "DiscoveryRefreshError";
  }
}

export async function serve(options: ServeOptions): Promise<void> {
  const store = new SnapshotStore(options.stateDb);
  const explicitTargets = options.sites?.length
    ? await resolveExplicitTargets(options.sites, options)
    : null;
  let discovery: DiscoveryState = explicitTargets
    ? {
        targets: explicitTargets,
        skipped: [],
        discovery: { status: "disabled", updatedAt: null },
      }
    : await initialDiscovery(options);

  if (discovery.targets.length === 0 && discovery.discovery.status !== "error") {
    process.stderr.write("[pt-monitor] No matching PT-depiler definitions discovered. Pass --sites hdtime,pter,...\n");
  }

  let collecting: Promise<unknown> | null = null;
  const refreshDiscovery = async (): Promise<boolean> => {
    try {
      const result = await runDiscovery(options);
      discovery = {
        ...result,
        discovery: { status: "ready", updatedAt: new Date().toISOString() },
      };
      if (discovery.targets.length === 0) {
        process.stderr.write("[pt-monitor] No matching PT-depiler definitions discovered. Pass --sites hdtime,pter,...\n");
      }
      return true;
    } catch (error) {
      const detail = discoveryDetail(error);
      if (options.debug) process.stderr.write(`[pt-monitor] discovery failed: ${detail}\n`);
      discovery = {
        targets: discovery.targets,
        skipped: discovery.skipped,
        discovery: {
          status: "error",
          updatedAt: discovery.discovery.updatedAt,
          error: { code: "discovery-failed", detail },
        },
      };
      return false;
    }
  };
  const collectAll = async (): Promise<Array<Record<string, unknown>>> => {
    if (collecting) {
      await collecting;
      return [];
    }
    const work = (async () => {
      if (!explicitTargets && !(await refreshDiscovery())) {
        throw new DiscoveryRefreshError(discovery.discovery.error?.detail ?? "Prowlarr discovery is unavailable");
      }
      const results: Array<Record<string, unknown>> = [];
      for (const target of discovery.targets) {
        if (target.prowlarrIndexerId < 0) {
          results.push({
            definition: target.definition,
            ok: false,
            error: "Prowlarr indexer binding is not unique",
          });
          continue;
        }
        try {
          const collected = await collectSite({
            prowlarrDb: options.prowlarrDb,
            definition: target.definition,
            indexer: target.prowlarrIndexerId || undefined,
            timeoutMs: options.timeoutMs,
            userAgent: options.userAgent,
            flaresolverrUrl: options.flaresolverrUrl,
            flaresolverrTimeoutMs: options.flaresolverrTimeoutMs,
            debug: options.debug,
            autoDiscoverIndexer: !explicitTargets,
          });
          store.insert(collected.snapshot);
          results.push({ definition: target.definition, ok: true, statusName: collected.snapshot.statusName });
        } catch (error) {
          const detail = safeErrorDetail(error);
          process.stderr.write(`[pt-monitor] collect ${target.definition}: ${detail}\n`);
          results.push({ definition: target.definition, ok: false, error: detail });
        }
      }
      return results;
    })();
    collecting = work;
    try {
      return await work;
    } finally {
      collecting = null;
    }
  };

  const server = createServer(async (req, res) => {
    try {
      await route(req, res, store, () => discovery, collectAll);
    } catch (error) {
      writeJson(res, 500, {
        error: { code: "internal-error", detail: safeErrorDetail(error) },
      });
    }
  });

  const listen = options.listen ?? "127.0.0.1";
  const port = options.port ?? 9709;
  server.listen(port, listen, () => {
    process.stderr.write(`[pt-monitor] UI: http://${listen}:${port}\n`);
    process.stderr.write(`[pt-monitor] sites: ${discovery.targets.map((target) => target.definition).join(", ") || "(none)"}\n`);
    process.stderr.write(`[pt-monitor] state DB: ${options.stateDb}\n`);
  });

  const collectInBackground = (): void => {
    void collectAll().catch((error) => {
      const detail = error instanceof DiscoveryRefreshError
        ? error.detail
        : "Background collection cycle failed.";
      process.stderr.write(`[pt-monitor] ${detail}\n`);
    });
  };

  // Start one collection immediately without delaying the HTTP listener.
  collectInBackground();
  const intervalMs = Math.max(1, options.intervalMinutes ?? 30) * 60_000;
  const timer = setInterval(collectInBackground, intervalMs);

  const shutdown = (): void => {
    clearInterval(timer);
    server.close(() => {
      store.close();
      process.exit(0);
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

export async function route(
  req: IncomingMessage,
  res: ServerResponse,
  store: SnapshotStore,
  getDiscovery: () => DiscoveryState,
  collectAll: () => Promise<Array<Record<string, unknown>>>,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (req.method === "GET" && (url.pathname === "/" || url.pathname.startsWith("/assets/"))) {
    serveStatic(res, url.pathname);
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/health") {
    writeJson(res, 200, { ok: true, definitions: getDiscovery().targets.map((target) => target.definition) });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/sites") {
    const state = getDiscovery();
    const sites = new Map<string, StoredSnapshot>();
    for (const definition of new Set(state.targets.map((target) => target.definition))) {
      const target = activeTarget(state, definition);
      if (!target) continue;
      const site = store.latestFor(target.definition, target.prowlarrIndexerId || undefined);
      if (!site) continue;
      sites.set(site.definition, site);
    }
    writeJson(res, 200, {
      sites: [...sites.values()]
        .sort((a, b) => a.definition.localeCompare(b.definition, undefined, { sensitivity: "base" }))
        .map(({ raw: _raw, ...item }) => item),
      skipped: state.skipped,
      discovery: state.discovery,
    });
    return;
  }
  const historyMatch = url.pathname.match(/^\/api\/sites\/([^/]+)\/history$/);
  if (req.method === "GET" && historyMatch) {
    const definition = decodeURIComponent(historyMatch[1]);
    const hoursRaw = Number(url.searchParams.get("hours") ?? 168);
    const hours = Number.isFinite(hoursRaw) && hoursRaw > 0 ? Math.min(hoursRaw, 24 * 365) : 168;
    const since = Date.now() - hours * 3600_000;
    const targets = getDiscovery().targets.filter((item) => item.definition === definition);
    if (targets.length > 1) {
      writeJson(res, 200, []);
      return;
    }
    const target = targets[0];
    writeJson(
      res,
      200,
      store.history(definition, since, 2000, target?.prowlarrIndexerId || undefined)
        .map(({ raw: _raw, ...item }) => item),
    );
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/collect") {
    try {
      writeJson(res, 200, await collectAll());
    } catch (error) {
      if (error instanceof DiscoveryRefreshError) {
        writeJson(res, error.status, {
          error: { code: "discovery-failed", detail: error.detail },
        });
        return;
      }
      throw error;
    }
    return;
  }
  writeJson(res, 404, { error: "not found" });
}

async function initialDiscovery(options: ServeOptions): Promise<DiscoveryState> {
  try {
    const result = await runDiscovery(options);
    return {
      ...result,
      discovery: { status: "ready", updatedAt: new Date().toISOString() },
    };
  } catch (error) {
    const detail = discoveryDetail(error);
    if (options.debug) process.stderr.write(`[pt-monitor] discovery failed: ${detail}\n`);
    return {
      targets: [],
      skipped: [],
      discovery: {
        status: "error",
        updatedAt: null,
        error: { code: "discovery-failed", detail },
      },
    };
  }
}

async function resolveExplicitTargets(definitions: string[], options: ServeOptions): Promise<SiteTarget[]> {
  try {
    const discovered = await runDiscovery(options);
    return definitions.map((definition) => {
      const matches = discovered.targets.filter((target) => target.definition === definition);
      return matches.length === 1 ? matches[0] : {
        definition,
        prowlarrIndexerId: -1,
        prowlarrIndexerName: "",
        matchReason: "explicit configuration could not be uniquely bound",
      };
    });
  } catch (error) {
    if (options.debug) process.stderr.write(`[pt-monitor] explicit indexer lookup failed: ${discoveryDetail(error)}\n`);
    return definitions.map((definition) => ({
      definition,
      prowlarrIndexerId: -1,
      prowlarrIndexerName: "",
      matchReason: "explicit configuration could not be bound",
    }));
  }
}

async function runDiscovery(options: ServeOptions): Promise<DiscoveryResult> {
  return discoverSiteResult(options.prowlarrDb, {
    log: options.debug ? (message) => process.stderr.write(`${message}\n`) : undefined,
  });
}

function discoveryDetail(error: unknown): string {
  if (error instanceof Error && error.message && !/(cookie|password|apikey|token|passkey|authorization)/i.test(error.message)) {
    return error.message;
  }
  return "Unable to inspect Prowlarr indexers or PT-depiler metadata.";
}

function activeTarget(state: DiscoveryState, definition: string): SiteTarget | null {
  const targets = state.targets.filter((target) => target.definition === definition);
  return targets.length === 1 ? targets[0] : null;
}

function safeErrorDetail(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/([?&](?:api[_-]?key|token|passkey|password|cookie|authorization)=)[^&\s]*/gi, "$1[redacted]")
    .replace(/\b(?:cookie|set-cookie)\s*[:=]\s*[^\r\n]*/gi, "cookie=[redacted]")
    .replace(/(["'](?:cookie|password|api[_-]?key|token|passkey|authorization)["']\s*:\s*)"[^"]*"/gi, '$1"[redacted]"')
    .replace(/\b(cookie|password|api[_-]?key|token|passkey|authorization)\s*[:=]\s*(?:bearer\s+)?(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi, "$1=[redacted]")
    .replace(/(https?:\/\/[^/\s:@]+:)[^@\s]+@/gi, "$1[redacted]@");
}

function serveStatic(res: ServerResponse, pathname: string): void {
  const fileName = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = resolve(UI_DIR, fileName);
  if (!filePath.startsWith(UI_DIR) || !existsSync(filePath)) {
    if (pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(UI_MISSING_HTML);
      return;
    }
    writeJson(res, 404, { error: "not found" });
    return;
  }
  const contentType = ASSET_CONTENT_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream";
  const immutable = pathname.startsWith("/assets/");
  res.writeHead(200, {
    "content-type": contentType,
    "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-store",
  });
  createReadStream(filePath).pipe(res);
}

function writeJson(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(`${JSON.stringify(value, (_key, item: unknown) => {
    if (item === Infinity) return "Infinity";
    if (item === -Infinity) return "-Infinity";
    return item;
  })}\n`);
}
