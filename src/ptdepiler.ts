import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const vendorRoot = resolve("vendor/PT-depiler");

async function importTsFile(path: string): Promise<Record<string, any>> {
  if (!existsSync(path)) throw new Error(`Missing vendored PT-depiler file: ${path}. Run: pnpm bootstrap`);
  return (await import(pathToFileURL(path).href)) as Record<string, any>;
}

export async function createSite(definition: string, baseUrl?: string, timeoutMs?: number): Promise<any> {
  const definitionPath = resolve(vendorRoot, `src/packages/site/definitions/${definition}.ts`);
  const definitionModule = await importTsFile(definitionPath);
  const metadata = definitionModule.siteMetadata;
  if (!metadata) throw new Error(`PT-depiler definition ${definition} has no siteMetadata export`);

  let SiteClass = definitionModule.default;
  if (!SiteClass) {
    const schema = metadata.schema ?? (metadata.type === "private" ? "AbstractPrivateSite" : "AbstractBittorrentSite");
    const schemaPath = resolve(vendorRoot, `src/packages/site/schemas/${schema}.ts`);
    const schemaModule = await importTsFile(schemaPath);
    SiteClass = schemaModule.default;
  }

  if (!SiteClass) throw new Error(`Unable to resolve PT-depiler class for definition ${definition}`);

  const userConfig: Record<string, unknown> = {
    allowSearch: false,
    allowQueryUserInfo: true,
    runtimeSettings: {},
  };
  if (timeoutMs) userConfig.timeout = timeoutMs;
  if (baseUrl) userConfig.url = baseUrl;

  return new SiteClass(metadata, userConfig);
}

export function vendorMarkerPath(): string {
  return resolve(vendorRoot, ".pt-monitor-node-patched.json");
}

export function vendorRootPath(): string {
  return vendorRoot;
}
