import { existsSync, readFileSync } from "node:fs";

import { ProwlarrDB } from "./prowlarr.ts";
import { createSite, vendorMarkerPath, vendorRootPath } from "./ptdepiler.ts";
import type { RuntimeOptions } from "./types.ts";
import { withUpstreamConsole } from "./upstream-console.ts";

interface ParsedArgs {
  positionals: string[];
  options: Map<string, string | true>;
}

function usage(exitCode = 2): never {
  const out = exitCode === 0 ? console.log : console.error;
  out(`Usage:
  pnpm cli doctor --db PATH
  pnpm cli list   --db PATH [--all]
  pnpm cli fetch  DEFINITION --db PATH [options]

List options:
  --all                         Include disabled and public indexers

Fetch options:
  --indexer NAME_OR_ID          Prowlarr indexer; default: DEFINITION
  --base-url URL                Override PT-depiler definition URL
  --timeout-ms MS               HTTP timeout; default: 30000
  --user-agent UA               Override User-Agent
  --flaresolverr-url URL        Enable Cloudflare fallback, e.g. http://127.0.0.1:8191/v1
  --flaresolverr-timeout-ms MS  FlareSolverr timeout; default: 90000
  --debug                       Print non-secret diagnostic information

Examples:
  pnpm cli list --db /srv/prowlarr/prowlarr.db
  pnpm cli fetch pter --db /srv/prowlarr/prowlarr.db
  pnpm cli fetch pter --db /srv/prowlarr/prowlarr.db --indexer PTer \\
    --flaresolverr-url http://127.0.0.1:8191/v1
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
    else if (arg === "--debug" || arg === "--all") options.set(arg.slice(2), true);
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
    } else {
      positionals.push(arg);
    }
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

function indexerSelector(value: string): string | number {
  return /^\d+$/.test(value) ? Number(value) : value;
}

function json(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

const RESULT_STATUS_NAMES = [
  "unknownError",
  "waiting",
  "working",
  "success",
  "parseError",
  "passParse",
  "CFBlocked",
  "needLogin",
  "noResults",
] as const;

function statusName(status: unknown): string | undefined {
  return typeof status === "number" ? RESULT_STATUS_NAMES[status] : undefined;
}

async function doctor(args: ParsedArgs): Promise<void> {
  const db = requiredOption(args, "db");
  const checks: Record<string, unknown> = {
    node: process.version,
    vendorRoot: vendorRootPath(),
    vendorExists: existsSync(vendorRootPath()),
    vendorMarker: existsSync(vendorMarkerPath()) ? JSON.parse(readFileSync(vendorMarkerPath(), "utf8")) : null,
    prowlarrDb: db,
    prowlarrDbExists: existsSync(db),
  };
  json(checks);
}

async function list(args: ParsedArgs): Promise<void> {
  const db = requiredOption(args, "db");
  const includeAll = args.options.get("all") === true;
  const rows = new ProwlarrDB(db)
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
    }));
  json(rows);
}

async function fetchSite(definition: string, args: ParsedArgs): Promise<void> {
  const db = requiredOption(args, "db");
  const indexerRaw = option(args, "indexer") ?? definition;
  const credentials = new ProwlarrDB(db).getIndexer(indexerSelector(indexerRaw));
  if (Object.keys(credentials.cookies).length === 0) {
    throw new Error(`Prowlarr indexer ${credentials.id}:${credentials.name} has no usable cookies`);
  }

  const timeoutMs = intOption(args, "timeout-ms", 30_000);
  const fsUrl = option(args, "flaresolverr-url");
  const runtimeOptions: RuntimeOptions = {
    http: {
      timeoutMs,
      userAgent: option(args, "user-agent") ?? "pt-monitor-ptdepiler-poc/0.2",
    },
    flaresolverr: fsUrl
      ? {
          enabled: true,
          url: fsUrl,
          timeoutMs: intOption(args, "flaresolverr-timeout-ms", 90_000),
        }
      : { enabled: false },
  };

  // Defer DOM/jsdom imports so `doctor` and `list` do not need the DOM runtime.
  const [{ installDomGlobals }, { installRuntime, NodeRuntime }] = await Promise.all([
    import("./dom.ts"),
    import("./runtime.ts"),
  ]);
  installDomGlobals();
  const runtime = new NodeRuntime(runtimeOptions, credentials.cookies);
  installRuntime(runtime);

  const debug = args.options.get("debug") === true;
  if (debug) {
    console.error(
      `[pt-monitor] definition=${definition} indexer=${credentials.id}:${credentials.name} cookies=${Object.keys(credentials.cookies).sort().join(",")} flaresolverr=${Boolean(fsUrl)}`,
    );
  }

  const result = await withUpstreamConsole(debug, async () => {
    const site = await createSite(definition, option(args, "base-url"), timeoutMs);
    return await site.getUserInfoResult();
  });

  json({
    collector: "PT-depiler",
    definition,
    prowlarrIndexer: { id: credentials.id, name: credentials.name },
    cookieNames: Object.keys(credentials.cookies).sort(),
    result: {
      ...result,
      statusName: statusName((result as { status?: unknown }).status),
    },
  });
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  if (!command) usage();
  if (command === "-h" || command === "--help") usage(0);

  const args = parseArgs(rest);
  if (args.options.get("help") === true) usage(0);

  switch (command) {
    case "doctor":
      await doctor(args);
      return;
    case "list":
      await list(args);
      return;
    case "fetch": {
      const definition = args.positionals[0];
      if (!definition) throw new Error("fetch requires a PT-depiler definition, e.g. pter");
      if (args.positionals.length > 1) throw new Error(`Unexpected positional argument: ${args.positionals[1]}`);
      await fetchSite(definition, args);
      return;
    }
    default:
      usage();
  }
}

main().catch((error) => {
  console.error(`[pt-monitor] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exitCode = 1;
});
