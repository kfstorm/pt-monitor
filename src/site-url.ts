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
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? candidate : undefined;
  } catch {
    return undefined;
  }
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
