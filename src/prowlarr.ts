import { DatabaseSync } from "node:sqlite";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import type { IndexerCredentials, ProwlarrIndexerPrivacy, ProwlarrPrivacySource } from "./types.ts";

function parseCookieHeader(value: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of value.split(";")) {
    const pos = part.indexOf("=");
    if (pos <= 0) continue;
    const name = part.slice(0, pos).trim();
    const cookieValue = part.slice(pos + 1).trim();
    if (name) out[name] = cookieValue;
  }
  return out;
}

function parseCookieObject(value: unknown): Record<string, string> {
  if (!value) return {};

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return {};
    try {
      return parseCookieObject(JSON.parse(trimmed));
    } catch {
      return parseCookieHeader(trimmed);
    }
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    const result: Record<string, string> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item === null || item === undefined) continue;
      if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
        result[key] = String(item);
      }
    }
    return result;
  }

  return {};
}

function findConfiguredCookies(value: unknown): Record<string, string> {
  const found: Record<string, string> = {};

  if (Array.isArray(value)) {
    for (const item of value) Object.assign(found, findConfiguredCookies(item));
    return found;
  }

  if (!value || typeof value !== "object") return found;

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (key.toLowerCase() === "cookie" || key.toLowerCase() === "cookies") {
      Object.assign(found, parseCookieObject(item));
    }
    Object.assign(found, findConfiguredCookies(item));
  }

  return found;
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function findDefinitionFile(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findDefinitionFile(item);
      if (found) return found;
    }
    return undefined;
  }

  if (!value || typeof value !== "object") return undefined;

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (key.toLowerCase() === "definitionfile" && typeof item === "string" && item.trim()) {
      return item.trim();
    }
    const found = findDefinitionFile(item);
    if (found) return found;
  }
  return undefined;
}

function privacyFromDefinitionText(text: string): ProwlarrIndexerPrivacy {
  // Cardigann's root-level `type:` is unindented. Do not match nested setting fields named `type`.
  const match = text.match(/^type:\s*["']?([^\s"'#]+)["']?\s*(?:#.*)?$/m);
  if (!match) return "unknown";
  switch (match[1].toLowerCase()) {
    case "private":
      return "private";
    case "public":
      return "public";
    default:
      // Mirrors Prowlarr's Cardigann mapping: anything other than private/public is semi-private.
      return "semi-private";
  }
}

function findDefinitionPath(root: string, definitionFile: string): string | undefined {
  if (!existsSync(root)) return undefined;
  const wanted = `${definitionFile}.yml`.toLowerCase();
  const stack = [root];

  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && entry.name.toLowerCase() === wanted) {
        return full;
      }
    }
  }
  return undefined;
}

export class ProwlarrDB {
  readonly path: string;
  readonly appDataDir: string;

  constructor(path: string) {
    this.path = resolve(path);
    this.appDataDir = dirname(this.path);
  }

  private resolvePrivacy(settings: unknown): {
    privacy: ProwlarrIndexerPrivacy;
    privacySource: ProwlarrPrivacySource;
    definitionFile?: string;
  } {
    const definitionFile = findDefinitionFile(settings);
    if (!definitionFile) return { privacy: "unknown", privacySource: "unknown" };

    const definitionPath = findDefinitionPath(join(this.appDataDir, "Definitions"), definitionFile);
    if (!definitionPath) {
      return { privacy: "unknown", privacySource: "unknown", definitionFile };
    }

    try {
      const privacy = privacyFromDefinitionText(readFileSync(definitionPath, "utf8"));
      return {
        privacy,
        privacySource: privacy === "unknown" ? "unknown" : "cardigann-definition",
        definitionFile,
      };
    } catch {
      return { privacy: "unknown", privacySource: "unknown", definitionFile };
    }
  }

  listIndexers(): IndexerCredentials[] {
    const db = new DatabaseSync(this.path, { readOnly: true });
    try {
      const rows = db
        .prepare(`
          SELECT
            i.Id AS Id,
            i.Name AS Name,
            i.Implementation AS Implementation,
            i.ConfigContract AS ConfigContract,
            i.Enable AS Enable,
            i.Settings AS Settings,
            s.Cookies AS RuntimeCookies,
            s.CookiesExpirationDate AS CookiesExpirationDate
          FROM Indexers AS i
          LEFT JOIN IndexerStatus AS s ON s.ProviderId = i.Id
          ORDER BY i.Name COLLATE NOCASE
        `)
        .all() as Array<Record<string, unknown>>;

      return rows.map((row) => {
        const settings = parseJson(row.Settings);
        const settingsRecord = settings && typeof settings === "object" && !Array.isArray(settings)
          ? (settings as Record<string, unknown>)
          : {};
        const configured = findConfiguredCookies(settings);
        const runtime = parseCookieObject(row.RuntimeCookies);
        const privacy = this.resolvePrivacy(settings);
        return {
          id: Number(row.Id),
          name: String(row.Name),
          implementation: String(row.Implementation ?? ""),
          configContract: String(row.ConfigContract ?? ""),
          enabled: Boolean(Number(row.Enable)),
          privacy: privacy.privacy,
          privacySource: privacy.privacySource,
          definitionFile: privacy.definitionFile,
          baseUrl:
            typeof settingsRecord.baseUrl === "string" && settingsRecord.baseUrl.trim()
              ? settingsRecord.baseUrl.trim()
              : undefined,
          settings: settingsRecord,
          // Runtime cookies are the latest view and win on duplicate names.
          cookies: { ...configured, ...runtime },
          cookieExpiration: row.CookiesExpirationDate ? String(row.CookiesExpirationDate) : null,
        };
      });
    } finally {
      db.close();
    }
  }

  getIndexer(selector: string | number): IndexerCredentials {
    const all = this.listIndexers();
    const numeric = typeof selector === "number" ? selector : /^\d+$/.test(selector) ? Number(selector) : null;

    if (numeric !== null) {
      const match = all.find((item) => item.id === numeric);
      if (!match) throw new ProwlarrIndexerResolutionError(`Prowlarr indexer id ${numeric} not found`);
      return match;
    }

    const wanted = String(selector).trim().toLocaleLowerCase();
    const exact = all.filter((item) => item.name.toLocaleLowerCase() === wanted);
    if (exact.length === 1) return exact[0];

    const partial = all.filter((item) => item.name.toLocaleLowerCase().includes(wanted));
    if (partial.length === 1) return partial[0];
    if (partial.length > 1) {
      throw new ProwlarrIndexerResolutionError(
        `Ambiguous Prowlarr indexer ${JSON.stringify(selector)}: ${partial.map((x) => `${x.id}:${x.name}`).join(", ")}`,
      );
    }

    throw new ProwlarrIndexerResolutionError(`Prowlarr indexer ${JSON.stringify(selector)} not found`);
  }
}

export class ProwlarrIndexerResolutionError extends Error {}

export const _test = {
  parseCookieHeader,
  parseCookieObject,
  findConfiguredCookies,
  findDefinitionFile,
  privacyFromDefinitionText,
  findDefinitionPath,
};
