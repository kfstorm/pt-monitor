import { rot13 } from "./rot13.ts";

type SiteUrlSource = {
  baseUrl?: unknown;
};

type SiteMetadata = {
  urls?: unknown;
  legacyUrls?: unknown;
};

function safeHttpUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const raw = value.trim();
  const candidate = /^uggcf?:\/\//i.test(raw) ? rot13(raw) : raw;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    if (parsed.username || parsed.password) return undefined;
    if ([...parsed.searchParams.keys()].some(isSensitiveUrlKey)) return undefined;
    if (hasSensitiveFragment(parsed.hash)) return undefined;
    return candidate;
  } catch {
    return undefined;
  }
}

function isSensitiveUrlKey(value: string): boolean {
  const key = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const exactKeys = [
    "accesskey",
    "accesstoken",
    "apikey",
    "auth",
    "authorization",
    "authtoken",
    "cookie",
    "passkey",
    "password",
    "passwd",
    "pwd",
    "secret",
    "token",
  ];
  const suffixes = ["auth", "bearer", "credential", "jwt", "password", "secret", "token"];
  return exactKeys.includes(key) || suffixes.some((suffix) => key.endsWith(suffix));
}

function hasSensitiveFragment(value: string): boolean {
  return value
    .replace(/^#/, "")
    .split(/[&;]/)
    .some((part) => {
      const rawKey = part.split("=", 1)[0];
      try {
        return isSensitiveUrlKey(decodeURIComponent(rawKey));
      } catch {
        return isSensitiveUrlKey(rawKey);
      }
    });
}

export function resolveSiteUrl(source: SiteUrlSource, metadata: SiteMetadata): string | undefined {
  const metadataUrls = [metadata.urls, metadata.legacyUrls].flatMap((value) =>
    Array.isArray(value) ? value : [],
  );
  for (const candidate of [source.baseUrl, ...metadataUrls]) {
    const url = safeHttpUrl(candidate);
    if (url) return url;
  }
  return undefined;
}
