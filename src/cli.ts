import { existsSync, readFileSync } from "node:fs";

import { ProwlarrDB } from "./prowlarr.ts";
import { vendorMarkerPath, vendorRootPath } from "./ptdepiler.ts";

interface ParsedArgs {
  positionals: string[];
  options: Map<string, string | true>;
}

function usage(exitCode = 2): never {
  const out = exitCode === 0 ? console.log : console.error;
  out(`Usage:
  pnpm cli doctor   --db PATH
  pnpm cli list     --db PATH [--all]
  pnpm cli fetch    DEFINITION --db PATH [options]
  pnpm cli snapshot DEFINITION --db PATH [--state-db PATH] [options]
  pnpm cli serve    --db PATH [--sites a,b,c] [options]

List options:
  --all                         Include disabled and public indexers

Collector options:
  --indexer NAME_OR_ID          Prowlarr indexer; default: auto-match definition
  --base-url URL                Override PT-depiler definition URL
  --timeout-ms MS               HTTP timeout; default: 30000
  --user-agent UA               Override User-Agent
  --flaresolverr-url URL        Enable Cloudflare fallback
  --flaresolverr-timeout-ms MS  FlareSolverr timeout; default: 90000
  --debug                       Print non-secret diagnostics to stderr

Serve options:
  --state-db PATH               Snapshot SQLite DB; default: ./data/pt-monitor.db
  --sites a,b,c                 Definitions to monitor; default: auto-discover intersection
  --listen ADDRESS              Default: 127.0.0.1
  --port PORT                   Default: 9709
  --interval-minutes N          Default: 30

Examples:
  pnpm cli list --db /srv/prowlarr/prowlarr.db
  pnpm cli fetch hdtime --db /srv/prowlarr/prowlarr.db
  pnpm cli snapshot hdtime --db /srv/prowlarr/prowlarr.db
  pnpm cli serve --db /srv/prowlarr/prowlarr.db --sites hdtime,pter,ultrahd
`);
  process.exit(exitCode);
}

function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const options = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (arg === "-h" || arg === "--help") options.set("help", true);
    else if (["--debug", "--all"].includes(arg)) options.set(arg.slice(2), true);
    else if (arg.startsWith("--")) {
      const equal = arg.indexOf("=");
      if (equal > 2) {
        options.set(arg.slice(2, equal), arg.slice(equal + 1));
        continue;
      }
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error(`Option --${key} requires a value`);
      options.set(key, value);
      i++;
    } else positionals.push(arg);
  }
  return { positionals, options };
}

function option(args: ParsedArgs, name: string): string | undefined {
  const value = args.options.get(name);
  return typeof value === "string" ? value : undefined;
}
function requiredOption(args: ParsedArgs, name: string): string {
  const value = option(args, name);
  if (!value) throw new Error(`--${name} is required`);
  return value;
}
function intOption(args: ParsedArgs, name: string, defaultValue: number): number {
  const raw = option(args, name);
  if (raw === undefined) return defaultValue;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`--${name} must be a positive integer`);
  return value;
}
function indexerSelector(value: string | undefined): string | number | undefined {
  return value === undefined ? undefined : /^\d+$/.test(value) ? Number(value) : value;
}
function json(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function collectOptions(definition: string, args: ParsedArgs) {
  return {
    prowlarrDb: requiredOption(args, "db"),
    definition,
    indexer: indexerSelector(option(args, "indexer")),
    baseUrl: option(args, "base-url"),
    timeoutMs: intOption(args, "timeout-ms", 30_000),
    userAgent: option(args, "user-agent") ?? "pt-monitor/0.3",
    flaresolverrUrl: option(args, "flaresolverr-url"),
    flaresolverrTimeoutMs: intOption(args, "flaresolverr-timeout-ms", 90_000),
    debug: args.options.get("debug") === true,
  };
}

async function doctor(args: ParsedArgs): Promise<void> {
  const db = requiredOption(args, "db");
  json({
    node: process.version,
    vendorRoot: vendorRootPath(),
    vendorExists: existsSync(vendorRootPath()),
    vendorMarker: existsSync(vendorMarkerPath()) ? JSON.parse(readFileSync(vendorMarkerPath(), "utf8")) : null,
    prowlarrDb: db,
    prowlarrDbExists: existsSync(db),
  });
}

async function list(args: ParsedArgs): Promise<void> {
  const db = requiredOption(args, "db");
  const includeAll = args.options.get("all") === true;
  json(
    new ProwlarrDB(db)
      .listIndexers()
      .filter((item) => includeAll || (item.enabled && item.privacy !== "public"))
      .map((item) => ({
        id: item.id,
        name: item.name,
        enabled: item.enabled,
        privacy: item.privacy,
        privacySource: item.privacySource,
        definitionFile: item.definitionFile,
        cookieNames: Object.keys(item.cookies).sort(),
        cookieCount: Object.keys(item.cookies).length,
        cookieExpiration: item.cookieExpiration,
      })),
  );
}

async function fetchSite(definition: string, args: ParsedArgs): Promise<void> {
  const { collectSite } = await import("./collector.ts");
  const collected = await collectSite(collectOptions(definition, args));
  json({
    collector: collected.collector,
    definition,
    prowlarrIndexer: collected.prowlarrIndexer,
    cookieNames: collected.cookieNames,
    result: { ...collected.result, statusName: collected.snapshot.statusName },
  });
}

async function snapshot(definition: string, args: ParsedArgs): Promise<void> {
  const [{ collectSite }, { SnapshotStore }] = await Promise.all([
    import("./collector.ts"),
    import("./store.ts"),
  ]);
  const collected = await collectSite(collectOptions(definition, args));
  const store = new SnapshotStore(option(args, "state-db") ?? "./data/pt-monitor.db");
  try {
    const id = store.insert(collected.snapshot);
    json({ id, snapshot: collected.snapshot });
  } finally {
    store.close();
  }
}

async function serveCommand(args: ParsedArgs): Promise<void> {
  const { serve } = await import("./server.ts");
  const sites = option(args, "sites")?.split(",").map((x) => x.trim()).filter(Boolean);
  await serve({
    prowlarrDb: requiredOption(args, "db"),
    stateDb: option(args, "state-db") ?? "./data/pt-monitor.db",
    sites,
    listen: option(args, "listen") ?? "127.0.0.1",
    port: intOption(args, "port", 9709),
    intervalMinutes: intOption(args, "interval-minutes", 30),
    timeoutMs: intOption(args, "timeout-ms", 30_000),
    userAgent: option(args, "user-agent") ?? "pt-monitor/0.3",
    flaresolverrUrl: option(args, "flaresolverr-url"),
    flaresolverrTimeoutMs: intOption(args, "flaresolverr-timeout-ms", 90_000),
    debug: args.options.get("debug") === true,
  });
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  if (!command) usage();
  if (command === "-h" || command === "--help") usage(0);
  const args = parseArgs(rest);
  if (args.options.get("help") === true) usage(0);

  if (command === "doctor") return doctor(args);
  if (command === "list") return list(args);
  if (command === "serve") return serveCommand(args);
  if (command === "fetch" || command === "snapshot") {
    const definition = args.positionals[0];
    if (!definition) throw new Error(`${command} requires a PT-depiler definition, e.g. hdtime`);
    if (args.positionals.length > 1) throw new Error(`Unexpected positional argument: ${args.positionals[1]}`);
    return command === "fetch" ? fetchSite(definition, args) : snapshot(definition, args);
  }
  usage();
}

main().catch((error) => {
  console.error(`[pt-monitor] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exitCode = 1;
});
