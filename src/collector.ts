import { ProwlarrDB } from "./prowlarr.ts";
import {
  createSite,
  listSiteMetadata,
  loadSiteMetadata,
  mapInputSettings,
} from "./ptdepiler.ts";
import type { IndexerCredentials, RuntimeOptions } from "./types.ts";
import { NodeRuntime, installRuntime } from "./runtime.ts";
import { installDomGlobals } from "./dom.ts";
import { withUpstreamConsole } from "./upstream-console.ts";
import { normalizeUserInfo, type AccountSnapshot } from "./normalize.ts";
import { rot13 } from "./rot13.ts";

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
  autoDiscoverIndexer?: boolean;
}

export interface CollectResult {
  collector: "PT-depiler";
  definition: string;
  prowlarrIndexer: { id: number; name: string };
  cookieNames: string[];
  result: Record<string, unknown>;
  snapshot: AccountSnapshot;
}

export interface SiteTarget {
  definition: string;
  prowlarrIndexerId: number;
  prowlarrIndexerName: string;
  matchReason: string;
}

export type SkippedSiteReason = "no-match" | "ambiguous" | "dead";

export interface SkippedSite {
  prowlarrIndexerId: number;
  prowlarrIndexerName: string;
  reason: SkippedSiteReason;
  candidates?: string[];
}

export interface DiscoveryResult {
  targets: SiteTarget[];
  skipped: SkippedSite[];
}

export interface DiscoveryOptions {
  log?: (message: string) => void;
}

export function discoveryOptions(debug?: boolean): DiscoveryOptions {
  return { log: debug ? undefined : () => {} };
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

export async function findIndexerForDefinition(
  prowlarrDb: string,
  definition: string,
  explicit?: string | number,
  log?: DiscoveryOptions["log"],
): Promise<IndexerCredentials> {
  const db = new ProwlarrDB(prowlarrDb);
  if (explicit !== undefined) return db.getIndexer(explicit);

  const targets = await discoverSiteTargets(prowlarrDb, {
    log: log ?? ((message) => process.stderr.write(`${message}\n`)),
  });
  const matchingTargets = targets.filter((target) => target.definition === definition);
  return matchingTargets.length === 1
    ? db.getIndexer(matchingTargets[0].prowlarrIndexerId)
    : findProwlarrIndexer(db, definition);
}

function normalized(value: unknown): string {
  return typeof value === "string" ? value.toLocaleLowerCase().replace(/[^a-z0-9]/g, "") : "";
}

function decodeUrl(value: string): string {
  return /^uggcf?:\/\//i.test(value) ? rot13(value) : value;
}

function host(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    return new URL(decodeUrl(value)).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function metadataNames(metadata: Record<string, any>): string[] {
  return [metadata.id, metadata.name, ...(metadata.aka ?? [])].filter((value): value is string => typeof value === "string");
}

function metadataHosts(metadata: Record<string, any>): string[] {
  return [...(metadata.urls ?? []), ...(metadata.legacyUrls ?? [])]
    .map((value) => host(value))
    .filter(Boolean);
}

function matchMetadata(
  indexer: IndexerCredentials,
  records: Awaited<ReturnType<typeof listSiteMetadata>>,
): Array<{ definition: string; score: number; reason: string; dead: boolean }> {
  const definitionKey = normalized(indexer.definitionFile);
  const indexerName = normalized(indexer.name);
  const implementation = normalized(indexer.implementation);
  const baseHost = host(indexer.baseUrl);
  return records.flatMap(({ definition, metadata }) => {
    let score = 0;
    const reasons: string[] = [];
    const ids = [definition, metadata.id].map(normalized).filter(Boolean);
    const names = metadataNames(metadata).map(normalized).filter(Boolean);
    const hosts = metadataHosts(metadata);

    if (definitionKey && ids.includes(definitionKey)) {
      score = Math.max(score, 100);
      reasons.push("normalized definition");
    }
    if (indexerName && names.includes(indexerName)) {
      score = Math.max(score, 90);
      reasons.push("metadata name");
    }
    if (implementation && names.includes(implementation)) {
      score = Math.max(score, 80);
      reasons.push("implementation name");
    }
    if (baseHost && hosts.includes(baseHost)) {
      score = Math.max(score, 70);
      reasons.push("metadata URL");
    }

    return score > 0
      ? [{ definition, score, reason: reasons.join(", "), dead: metadata.isDead === true }]
      : [];
  });
}

function discoveryLog(message: string, options: DiscoveryOptions): void {
  options.log?.(`[pt-monitor] ${message}`);
}

export async function discoverSiteResult(prowlarrDb: string, options: DiscoveryOptions = {}): Promise<DiscoveryResult> {
  ensureDom();
  const db = new ProwlarrDB(prowlarrDb);
  const records = await listSiteMetadata();
  const targets: SiteTarget[] = [];
  const skipped: SkippedSite[] = [];
  const candidates = db.listIndexers().filter((item) => item.enabled && item.privacy !== "public");

  for (const indexer of candidates) {
    const matches = matchMetadata(indexer, records).sort((a, b) => b.score - a.score || a.definition.localeCompare(b.definition));
    const liveMatches = matches.filter((match) => !match.dead);
    if (liveMatches.length === 0) {
      const reason: SkippedSiteReason = matches.length > 0 ? "dead" : "no-match";
      skipped.push({
        prowlarrIndexerId: indexer.id,
        prowlarrIndexerName: indexer.name,
        reason,
      });
      discoveryLog(
        `skip indexer ${indexer.id}:${indexer.name}: ${reason === "dead" ? `candidates are marked dead: ${matches.map((match) => match.definition).join(", ")}` : "no PT-depiler metadata matched"} (implementation=${indexer.implementation || "unknown"}, definitionFile=${indexer.definitionFile ?? "none"})`,
        options,
      );
      continue;
    }

    const best = liveMatches[0];
    const tied = liveMatches.filter((match) => match.score === best.score);
    if (tied.length > 1) {
      skipped.push({
        prowlarrIndexerId: indexer.id,
        prowlarrIndexerName: indexer.name,
        reason: "ambiguous",
        candidates: tied.map((match) => match.definition),
      });
      discoveryLog(
        `skip indexer ${indexer.id}:${indexer.name}: ambiguous PT-depiler candidates ${tied.map((match) => match.definition).join(", ")} (score=${best.score})`,
        options,
      );
      continue;
    }

    targets.push({
      definition: best.definition,
      prowlarrIndexerId: indexer.id,
      prowlarrIndexerName: indexer.name,
      matchReason: `${best.reason} (score=${best.score})`,
    });
    discoveryLog(
      `matched indexer ${indexer.id}:${indexer.name} -> ${best.definition} via ${best.reason} (score=${best.score})`,
      options,
    );
  }

  return { targets, skipped };
}

export async function discoverSiteTargets(prowlarrDb: string, options: DiscoveryOptions = {}): Promise<SiteTarget[]> {
  return (await discoverSiteResult(prowlarrDb, options)).targets;
}

export async function collectSite(options: CollectOptions): Promise<CollectResult> {
  ensureDom();
  const db = new ProwlarrDB(options.prowlarrDb);
  let credentials: IndexerCredentials;
  if (options.indexer !== undefined) {
    credentials = findProwlarrIndexer(db, options.definition, options.indexer);
  } else if (options.autoDiscoverIndexer === false) {
    credentials = findProwlarrIndexer(db, options.definition);
  } else {
    const targets = await discoverSiteTargets(options.prowlarrDb, {
      log: options.debug ? (message) => process.stderr.write(`${message}\n`) : undefined,
    });
    const matchingTargets = targets.filter((target) => target.definition === options.definition);
    if (matchingTargets.length !== 1) {
      throw new Error(`Prowlarr indexer binding for ${options.definition} is not unique`);
    }
    credentials = db.getIndexer(matchingTargets[0].prowlarrIndexerId);
  }
  const metadata = await loadSiteMetadata(options.definition);
  const inputSetting = mapInputSettings(metadata, credentials.settings, credentials.cookies);
  const missingInputs = ((metadata.userInputSettingMeta ?? []) as Array<{ name: string; required?: boolean }>)
    .filter((input) => input.required && !inputSetting[input.name])
    .map((input) => input.name);
  if (missingInputs.length > 0) {
    throw new Error(
      `Prowlarr indexer ${credentials.id}:${credentials.name} is missing required PT-depiler settings: ${missingInputs.join(", ")}`,
    );
  }
  if (Object.keys(credentials.cookies).length === 0 && Object.keys(inputSetting).length === 0) {
    throw new Error(`Prowlarr indexer ${credentials.id}:${credentials.name} has no usable authentication material`);
  }

  const runtime = new NodeRuntime(runtimeOptions(options), credentials.cookies);
  installRuntime(runtime);

  if (options.debug) {
    console.error(
      `[pt-monitor] definition=${options.definition} indexer=${credentials.id}:${credentials.name} cookies=${Object.keys(credentials.cookies).sort().join(",")} flaresolverr=${Boolean(options.flaresolverrUrl)}`,
    );
  }

  const result = (await withUpstreamConsole(Boolean(options.debug), async () => {
    const site = await createSite(
      options.definition,
      options.baseUrl ?? credentials.baseUrl,
      options.timeoutMs ?? 30_000,
      inputSetting,
    );
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

export async function discoverDefinitions(prowlarrDb: string): Promise<string[]> {
  const targets = await discoverSiteTargets(prowlarrDb);
  return [...new Set(targets.map((target) => target.definition))];
}
