import { createReadStream, existsSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, resolve } from "node:path";

import {
  collectSite,
  discoverSiteTargets,
  findProwlarrIndexer,
  type SiteTarget,
} from "./collector.ts";
import { ProwlarrDB } from "./prowlarr.ts";
import { loadSiteMetadata } from "./ptdepiler.ts";
import { resolveSiteUrl } from "./site-url.ts";
import { SnapshotStore } from "./store.ts";

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

export async function serve(options: ServeOptions): Promise<void> {
  const store = new SnapshotStore(options.stateDb);
  const targets: SiteTarget[] = options.sites?.length
    ? options.sites.map((definition) => ({
        definition,
        prowlarrIndexerId: 0,
        prowlarrIndexerName: "",
        matchReason: "explicit configuration",
      }))
    : await discoverSiteTargets(options.prowlarrDb);
  if (targets.length === 0) {
    process.stderr.write("[pt-monitor] No matching PT-depiler definitions discovered. Pass --sites hdtime,pter,...\n");
  }

  let collecting: Promise<unknown> | null = null;
  const siteUrls = new Map<string, string>();

  const refreshSiteUrls = async (): Promise<void> => {
    try {
      const db = new ProwlarrDB(options.prowlarrDb);
      for (const target of targets) {
        try {
          const indexer = findProwlarrIndexer(
            db,
            target.definition,
            target.prowlarrIndexerId || undefined,
          );
          const metadata = await loadSiteMetadata(target.definition);
          const url = resolveSiteUrl(indexer, metadata);
          const key = siteUrlKey(target.definition, indexer.id);
          if (url) siteUrls.set(key, url);
          else siteUrls.delete(key);
        } catch {
          // Keep the last valid URL when a refresh fails transiently.
        }
      }
    } catch {
      // Keep the last valid URLs when Prowlarr is temporarily unavailable.
    }
  };

  const collectAll = async (): Promise<Array<Record<string, unknown>>> => {
    if (collecting) {
      await collecting;
      return [];
    }
    const work = (async () => {
      const results: Array<Record<string, unknown>> = [];
      await refreshSiteUrls();
      for (const target of targets) {
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
          });
          store.insert(collected.snapshot);
          results.push({ definition: target.definition, ok: true, statusName: collected.snapshot.statusName });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const detail = error instanceof Error ? error.stack ?? message : String(error);
          process.stderr.write(`[pt-monitor] collect ${target.definition}: ${detail}\n`);
          results.push({ definition: target.definition, ok: false, error: message });
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
      await route(
        req,
        res,
        store,
        targets.map((target) => target.definition),
        collectAll,
        siteUrls,
      );
    } catch (error) {
      writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  const listen = options.listen ?? "127.0.0.1";
  const port = options.port ?? 9709;
  server.listen(port, listen, () => {
    process.stderr.write(`[pt-monitor] UI: http://${listen}:${port}\n`);
    process.stderr.write(`[pt-monitor] sites: ${targets.map((target) => target.definition).join(", ") || "(none)"}\n`);
    process.stderr.write(`[pt-monitor] state DB: ${options.stateDb}\n`);
  });

  // Start one collection immediately without delaying the HTTP listener.
  void collectAll();
  const intervalMs = Math.max(1, options.intervalMinutes ?? 30) * 60_000;
  const timer = setInterval(() => void collectAll(), intervalMs);

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

async function route(
  req: IncomingMessage,
  res: ServerResponse,
  store: SnapshotStore,
  definitions: string[],
  collectAll: () => Promise<Array<Record<string, unknown>>>,
  siteUrls: ReadonlyMap<string, string>,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (req.method === "GET" && (url.pathname === "/" || url.pathname.startsWith("/assets/"))) {
    serveStatic(res, url.pathname);
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/health") {
    writeJson(res, 200, { ok: true, definitions });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/sites") {
    writeJson(
      res,
      200,
      store.latest().map(({ raw: _raw, ...item }) => {
        const siteUrl = siteUrls.get(siteUrlKey(item.definition, item.prowlarrIndexerId));
        return siteUrl ? { ...item, siteUrl } : item;
      }),
    );
    return;
  }
  const historyMatch = url.pathname.match(/^\/api\/sites\/([^/]+)\/history$/);
  if (req.method === "GET" && historyMatch) {
    const definition = decodeURIComponent(historyMatch[1]);
    const hoursRaw = Number(url.searchParams.get("hours") ?? 168);
    const hours = Number.isFinite(hoursRaw) && hoursRaw > 0 ? Math.min(hoursRaw, 24 * 365) : 168;
    const since = Date.now() - hours * 3600_000;
    writeJson(
      res,
      200,
      store.history(definition, since).map(({ raw: _raw, ...item }) => item),
    );
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/collect") {
    writeJson(res, 200, await collectAll());
    return;
  }
  writeJson(res, 404, { error: "not found" });
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

function siteUrlKey(definition: string, prowlarrIndexerId: number): string {
  return `${definition}:${prowlarrIndexerId}`;
}
