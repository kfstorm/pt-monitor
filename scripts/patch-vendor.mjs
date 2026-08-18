import { cpSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const vendor = resolve(root, "vendor/PT-depiler");
const expectedCommit = process.env.PT_DEPILER_COMMIT ?? "82df7210244d9352d4f9792a17905f51f8ed2304";

if (!existsSync(vendor)) throw new Error(`Missing ${vendor}`);

const adapterSource = resolve(root, "patches/adapter.node.ts");
const adapterTarget = resolve(vendor, "src/packages/site/utils/adapter.ts");
cpSync(adapterSource, adapterTarget);

const abstractPath = resolve(vendor, "src/packages/site/schemas/AbstractBittorrentSite.ts");
let abstractSource = readFileSync(abstractPath, "utf8");
const socialImport = 'import { supportSocialSite } from "@ptd/social";';
if (abstractSource.includes(socialImport)) {
  abstractSource = abstractSource.replace(
    socialImport,
    "// Node PoC: social-site search is irrelevant to user-info collection.\nconst supportSocialSite: string[] = [];",
  );
} else if (!abstractSource.includes("const supportSocialSite: string[] = [];")) {
  throw new Error("Upstream AbstractBittorrentSite.ts changed: supportSocialSite import not found");
}
writeFileSync(abstractPath, abstractSource);

// PT-depiler assumes every Axios failure has `error.response`. Transport/setup
// errors (unsupported protocol, DNS, TLS, timeout before response, etc.) do not.
// Re-throw those so the original error reaches getUserInfoResult/debug output
// instead of causing a misleading `loggedCheck(undefined)` TypeError.
{
  let source = readFileSync(abstractPath, "utf8");
  const from = `    } catch (e) {\n      // 从 AxiosError 中获取 response\n      req = (e as AxiosError).response!;\n    }`;
  const to = `    } catch (e) {\n      // Node transport/setup errors may not have an HTTP response. Preserve the\n      // original error instead of passing undefined into loggedCheck().\n      const errorResponse = (e as AxiosError).response;\n      if (!errorResponse) throw e;\n      req = errorResponse;\n    }`;
  if (source.includes(from)) {
    source = source.replace(from, to);
    writeFileSync(abstractPath, source);
  } else if (!source.includes("if (!errorResponse) throw e;")) {
    throw new Error("Upstream AbstractBittorrentSite.ts changed: Axios catch block not found");
  }
}

// filter.ts imports @ptd/social only for external-ID filters used by torrent search.
// This PoC disables search entirely and only needs user-info collection, so keep
// those filters as no-op string pass-throughs instead of pulling in the browser
// social package (which itself relies on PT-depiler/Vite path aliases).
const filterPath = resolve(vendor, "src/packages/site/utils/filter.ts");
let filterSource = readFileSync(filterPath, "utf8");
const socialMapImport = 'import { socialParseUrlMap } from "@ptd/social/index.ts";';
const socialMapStub = `const socialParseUrlMap: Record<string, (query: any) => any> = {
  anidb: (query) => query,
  bangumi: (query) => query,
  douban: (query) => query,
  imdb: (query) => query,
  tvmaze: (query) => query,
};`;
if (filterSource.includes(socialMapImport)) {
  filterSource = filterSource.replace(
    socialMapImport,
    `// Node PoC: social-ID parsing is irrelevant to user-info collection.\n${socialMapStub}`,
  );
} else if (!filterSource.includes("const socialParseUrlMap:")) {
  throw new Error("Upstream filter.ts changed: @ptd/social import not found");
}
writeFileSync(filterPath, filterSource);

function patchTextFile(relativePath, replacements) {
  const filePath = resolve(vendor, relativePath);
  let source = readFileSync(filePath, "utf8");
  for (const { from, to, marker } of replacements) {
    if (source.includes(from)) {
      source = source.replace(from, to);
    } else if (marker && source.includes(marker)) {
      // Already patched.
    } else {
      throw new Error(`Upstream ${relativePath} changed: expected text not found: ${from}`);
    }
  }
  writeFileSync(filePath, source);
}

// Eliminate the remaining PT-depiler Vite/TS path aliases from the site package.
// Some are only type/search helpers, but keeping the vendored site tree alias-free
// makes arbitrary definitions loadable under plain Node/tsx.
patchTextFile("src/packages/site/types/search.ts", [
  {
    from: 'import type { TSupportSocialSite$1 } from "@ptd/social";',
    to: '// Node PoC: social-site identifiers are only used as search keyword types.\ntype TSupportSocialSite$1 = string;',
    marker: 'type TSupportSocialSite$1 = string;',
  },
]);

patchTextFile("src/packages/site/types/torrent.ts", [
  {
    from: 'import type { TAdvanceSearchKeyword } from "@ptd/site";',
    to: 'import type { TAdvanceSearchKeyword } from "./search.ts";',
    marker: 'from "./search.ts"',
  },
]);

patchTextFile("src/packages/site/utils/tags.ts", [
  {
    from: 'import type { ITorrentTag } from "@ptd/site";',
    to: 'import type { ITorrentTag } from "../types/torrent.ts";',
    marker: 'from "../types/torrent.ts"',
  },
]);

patchTextFile("src/packages/site/definitions/rousipro.ts", [
  {
    from: 'import { ISearchInput, ISiteMetadata, ITorrent, ITorrentTag, TPreDefinedTorrentTagName } from "@ptd/site";\nimport PrivateSite from "@ptd/site/schemas/AbstractPrivateSite.ts";',
    to: 'import { ISearchInput, ISiteMetadata, ITorrent, ITorrentTag } from "../types";\nimport type { TPreDefinedTorrentTagName } from "../utils/tags.ts";\nimport PrivateSite from "../schemas/AbstractPrivateSite.ts";',
    marker: 'from "../utils/tags.ts"',
  },
]);

patchTextFile("src/packages/site/definitions/animebytes.ts", [
  {
    from: 'import { parse } from "@ptd/social/entity/anidb";',
    to: `// Node PoC: inline the tiny AniDB ID parser instead of importing the browser social package.
function parse(query: string | number | undefined): string {
  if (typeof query === "undefined") return "";
  const value = String(query).trim();
  return value.match(/(?:https?:\/\/)?(?:www\.)?anidb\.net\/(?:a|anime\/)(\d+)/)?.[1] ?? value;
}`,
    marker: 'inline the tiny AniDB ID parser',
  },
]);

patchTextFile("src/packages/site/definitions/mteam.ts", [
  {
    from: 'import { build as buildDouban } from "@ptd/social/entity/douban.ts";\nimport { build as buildImdb } from "@ptd/social/entity/imdb.ts";',
    to: `// Node PoC: these two social helpers are pure URL builders; inline them to avoid the browser social package.
const buildDouban = (id: string): string => \`https://movie.douban.com/subject/\${id}/\`;
const buildImdb = (id: string): string => \`https://www.imdb.com/title/\${id}/\`;`,
    marker: 'these two social helpers are pure URL builders',
  },
]);

patchTextFile("src/packages/site/schemas/NexusPHP.ts", [
  {
    from: "parseSizeString(sizeSelector.innerText.trim())",
    to: 'parseSizeString((sizeSelector?.innerText ?? sizeSelector?.textContent ?? "").trim())',
    marker: "sizeSelector?.innerText ?? sizeSelector?.textContent",
  },
]);

function walk(path) {
  for (const name of readdirSync(path)) {
    const item = join(path, name);
    if (statSync(item).isDirectory()) walk(item);
    else if (name.endsWith(".ts")) {
      const before = readFileSync(item, "utf8");
      const after = before.replaceAll("import.meta.env.DEV", "false");
      if (after !== before) writeFileSync(item, after);
    }
  }
}
const siteRoot = resolve(vendor, "src/packages/site");
walk(siteRoot);

// PT-depiler normally logs user-info parse exceptions only in Vite DEV mode.
// The Node overlay removes import.meta.env, so make this one diagnostic unconditional;
// src/upstream-console.ts suppresses it normally and forwards it to stderr with --debug.
{
  const privateSitePath = resolve(siteRoot, "schemas/AbstractPrivateSite.ts");
  let source = readFileSync(privateSitePath, "utf8");
  const before = source;
  source = source.replace(
    /\s*if \((?:false|true|import\.meta\.env\.DEV)\) \{\s*console\.error\(error\);\s*\}/,
    "\n      console.error(error);",
  );
  if (source === before && !source.includes("console.error(error);")) {
    throw new Error("Could not expose PT-depiler user-info parse errors for --debug");
  }
  if (source !== before) writeFileSync(privateSitePath, source);
}

// Make path-alias leaks fail during bootstrap instead of much later at runtime.
const aliasLeaks = [];
function findAliasLeaks(path) {
  for (const name of readdirSync(path)) {
    const item = join(path, name);
    if (statSync(item).isDirectory()) findAliasLeaks(item);
    else if (name.endsWith(".ts")) {
      const source = readFileSync(item, "utf8");
      if (/from\s+["']@ptd\//.test(source) || /import\(["']@ptd\//.test(source)) {
        aliasLeaks.push(item.replace(vendor + "/", ""));
      }
    }
  }
}
findAliasLeaks(siteRoot);
if (aliasLeaks.length) {
  throw new Error(`Unhandled PT-depiler path aliases remain after patching:\n${aliasLeaks.join("\n")}`);
}

writeFileSync(
  resolve(vendor, ".pt-monitor-node-patched.json"),
  JSON.stringify(
    {
      upstream: "pt-plugins/PT-depiler",
      commit: expectedCommit,
      patches: [
        "replace browser site/utils/adapter.ts with Node adapter (including protected-URL decoding)",
        "stub @ptd/social supportSocialSite for user-info-only PoC",
        "stub @ptd/social socialParseUrlMap filters for user-info-only PoC",
        "rewrite remaining @ptd/site self aliases to relative imports",
        "inline tiny social helpers used by animebytes/mteam definitions",
        "replace import.meta.env.DEV inside site package",
        "preserve Axios transport/setup errors that have no HTTP response",
        "fallback from missing jsdom innerText while parsing NexusPHP seeding size",
      ],
    },
    null,
    2,
  ) + "\n",
);

console.log("PT-depiler Node overlay applied.");
