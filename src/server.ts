import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { collectSite, discoverSiteTargets, type SiteTarget } from "./collector.ts";
import { SnapshotStore } from "./store.ts";
import { dashboardHtml } from "./ui.ts";

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
  const collectAll = async (): Promise<Array<Record<string, unknown>>> => {
    if (collecting) {
      await collecting;
      return [];
    }
    const work = (async () => {
      const results: Array<Record<string, unknown>> = [];
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
      await route(req, res, store, targets.map((target) => target.definition), collectAll);
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
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    res.end(dashboardHtml);
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/health") {
    writeJson(res, 200, { ok: true, definitions });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/sites") {
    writeJson(res, 200, store.latest().map(({ raw: _raw, ...item }) => item));
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

function writeJson(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(`${JSON.stringify(value, (_key, item: unknown) => {
    if (item === Infinity) return "Infinity";
    if (item === -Infinity) return "-Infinity";
    return item;
  })}\n`);
}
