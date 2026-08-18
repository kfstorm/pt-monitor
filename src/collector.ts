import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { ProwlarrDB } from "./prowlarr.ts";
import { createSite, vendorRootPath } from "./ptdepiler.ts";
import type { IndexerCredentials, RuntimeOptions } from "./types.ts";
import { NodeRuntime, installRuntime } from "./runtime.ts";
import { installDomGlobals } from "./dom.ts";
import { withUpstreamConsole } from "./upstream-console.ts";
import { normalizeUserInfo, type AccountSnapshot } from "./normalize.ts";

let domInstalled = false;

function ensureDom(): void {
  if (domInstalled) return;
  installDomGlobals();
  domInstalled = true;
}

export interface CollectOptions {
  prowlarrDb: string;
  definition: string;
  indexer?: string | number;
  baseUrl?: string;
  timeoutMs?: number;
  userAgent?: string;
  flaresolverrUrl?: string;
  flaresolverrTimeoutMs?: number;
  debug?: boolean;
}

export interface CollectResult {
  collector: "PT-depiler";
  definition: string;
  prowlarrIndexer: { id: number; name: string };
  cookieNames: string[];
  result: Record<string, unknown>;
  snapshot: AccountSnapshot;
}

function runtimeOptions(options: CollectOptions): RuntimeOptions {
  const timeoutMs = options.timeoutMs ?? 30_000;
  return {
    http: {
      timeoutMs,
      userAgent: options.userAgent ?? "pt-monitor/0.3",
    },
    flaresolverr: options.flaresolverrUrl
      ? {
          enabled: true,
          url: options.flaresolverrUrl,
          timeoutMs: options.flaresolverrTimeoutMs ?? 90_000,
        }
      : { enabled: false },
  };
}

export function findProwlarrIndexer(db: ProwlarrDB, definition: string, explicit?: string | number): IndexerCredentials {
  if (explicit !== undefined) return db.getIndexer(explicit);

  const candidates = db.listIndexers().filter((item) => item.enabled && item.privacy !== "public");
  const byDefinition = candidates.filter((item) => item.definitionFile?.toLowerCase() === definition.toLowerCase());
  if (byDefinition.length === 1) return byDefinition[0];

  const normalized = definition.toLowerCase().replace(/[^a-z0-9]/g, "");
  const byName = candidates.filter(
    (item) => item.name.toLowerCase().replace(/[^a-z0-9]/g, "") === normalized,
  );
  if (byName.length === 1) return byName[0];

  return db.getIndexer(definition);
}

export async function collectSite(options: CollectOptions): Promise<CollectResult> {
  ensureDom();
  const db = new ProwlarrDB(options.prowlarrDb);
  const credentials = findProwlarrIndexer(db, options.definition, options.indexer);
  if (Object.keys(credentials.cookies).length === 0) {
    throw new Error(`Prowlarr indexer ${credentials.id}:${credentials.name} has no usable cookies`);
  }

  const runtime = new NodeRuntime(runtimeOptions(options), credentials.cookies);
  installRuntime(runtime);

  if (options.debug) {
    console.error(
      `[pt-monitor] definition=${options.definition} indexer=${credentials.id}:${credentials.name} cookies=${Object.keys(credentials.cookies).sort().join(",")} flaresolverr=${Boolean(options.flaresolverrUrl)}`,
    );
  }

  const result = (await withUpstreamConsole(Boolean(options.debug), async () => {
    const site = await createSite(options.definition, options.baseUrl, options.timeoutMs ?? 30_000);
    return (await site.getUserInfoResult()) as Record<string, unknown>;
  })) as Record<string, unknown>;

  return {
    collector: "PT-depiler",
    definition: options.definition,
    prowlarrIndexer: { id: credentials.id, name: credentials.name },
    cookieNames: Object.keys(credentials.cookies).sort(),
    result,
    snapshot: normalizeUserInfo(options.definition, credentials, result),
  };
}

export function discoverDefinitions(prowlarrDb: string): string[] {
  const db = new ProwlarrDB(prowlarrDb);
  return db
    .listIndexers()
    .filter((item) => item.enabled && item.privacy !== "public" && item.definitionFile)
    .map((item) => item.definitionFile!)
    .filter((definition, index, all) => all.indexOf(definition) === index)
    .filter((definition) => existsSync(resolve(vendorRootPath(), `src/packages/site/definitions/${definition}.ts`)))
    .sort((a, b) => a.localeCompare(b));
}
