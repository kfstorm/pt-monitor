import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { installDomGlobals } from "./dom.ts";

const vendorRoot = resolve("vendor/PT-depiler");

async function importTsFile(path: string): Promise<Record<string, any>> {
  if (!existsSync(path)) throw new Error(`Missing vendored PT-depiler file: ${path}. Run: pnpm bootstrap`);
  return (await import(pathToFileURL(path).href)) as Record<string, any>;
}

export interface SiteMetadataRecord {
  definition: string;
  metadata: Record<string, any>;
}

let metadataCatalog: Promise<SiteMetadataRecord[]> | null = null;

export async function loadSiteMetadata(definition: string): Promise<Record<string, any>> {
  installDomGlobals();
  const definitionPath = resolve(vendorRoot, `src/packages/site/definitions/${definition}.ts`);
  const definitionModule = await importTsFile(definitionPath);
  const metadata = definitionModule.siteMetadata;
  if (!metadata) throw new Error(`PT-depiler definition ${definition} has no siteMetadata export`);
  return metadata;
}

async function siteMetadataCatalog(): Promise<SiteMetadataRecord[]> {
  if (!metadataCatalog) {
    metadataCatalog = (async () => {
      const definitionsPath = resolve(vendorRoot, "src/packages/site/definitions");
      const files = readdirSync(definitionsPath)
        .filter((name) => name.endsWith(".ts"))
        .map((name) => name.slice(0, -3))
        .sort((a, b) => a.localeCompare(b));
      const records: SiteMetadataRecord[] = [];
      for (const definition of files) {
        try {
          records.push({ definition, metadata: await loadSiteMetadata(definition) });
        } catch {
          // A single optional upstream definition must not hide other sites.
        }
      }
      return records;
    })();
  }
  return metadataCatalog;
}

export async function listSiteMetadata(): Promise<SiteMetadataRecord[]> {
  return siteMetadataCatalog();
}

function normalizeCredentialKey(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (["apikey", "apitoken", "accesstoken", "authtoken", "token"].includes(normalized)) return "token";
  if (["passkey", "torrentpass", "torrentpassword"].includes(normalized)) return "passkey";
  if (["username", "user", "login"].includes(normalized)) return "username";
  if (["password", "passwd", "pwd"].includes(normalized)) return "password";
  if (["cookie", "cookies"].includes(normalized)) return "cookie";
  return normalized;
}

function scalarSettings(value: unknown, out: Array<[string, string]> = [], keyPath: string[] = []): Array<[string, string]> {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scalarSettings(item, out, [...keyPath, String(index)]));
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      scalarSettings(item, out, [...keyPath, key]);
    }
  } else if (keyPath.length > 0 && (typeof value === "string" || typeof value === "number" || typeof value === "boolean")) {
    out.push([keyPath[keyPath.length - 1], String(value)]);
  }
  return out;
}

export function mapInputSettings(
  metadata: Record<string, any>,
  settings: Record<string, unknown>,
  cookies: Record<string, string> = {},
): Record<string, string> {
  const entries = scalarSettings(settings);
  const byName = new Map(entries.map(([name, value]) => [name.toLowerCase().replace(/[^a-z0-9]/g, ""), value]));
  const byKind = new Map<string, string>();
  for (const [name, value] of entries) {
    const kind = normalizeCredentialKey(name);
    if (!byKind.has(kind) && value.trim()) byKind.set(kind, value);
  }

  const result: Record<string, string> = {};
  for (const input of (metadata.userInputSettingMeta ?? []) as Array<{ name: string }>) {
    const exact = byName.get(input.name.toLowerCase().replace(/[^a-z0-9]/g, ""));
    const value = exact ?? byKind.get(normalizeCredentialKey(input.name));
    if (value?.trim()) result[input.name] = value;
    if (!value && normalizeCredentialKey(input.name) === "cookie" && Object.keys(cookies).length > 0) {
      result[input.name] = Object.entries(cookies)
        .map(([name, cookieValue]) => `${name}=${cookieValue}`)
        .join("; ");
    }
  }
  return result;
}

export async function createSite(
  definition: string,
  baseUrl?: string,
  timeoutMs?: number,
  inputSetting?: Record<string, string>,
): Promise<any> {
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
  if (inputSetting && Object.keys(inputSetting).length > 0) userConfig.inputSetting = inputSetting;

  return new SiteClass(metadata, userConfig);
}

export function vendorMarkerPath(): string {
  return resolve(vendorRoot, ".pt-monitor-node-patched.json");
}

export function vendorRootPath(): string {
  return vendorRoot;
}

export const _test = { normalizeCredentialKey, scalarSettings };
