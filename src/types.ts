export interface RuntimeOptions {
  http?: {
    timeoutMs?: number;
    userAgent?: string;
  };
  flaresolverr?: {
    enabled?: boolean;
    url?: string;
    timeoutMs?: number;
  };
}

export type ProwlarrIndexerPrivacy = "public" | "semi-private" | "private" | "unknown";
export type ProwlarrPrivacySource = "cardigann-definition" | "unknown";

export interface IndexerCredentials {
  id: number;
  name: string;
  implementation: string;
  configContract: string;
  enabled: boolean;
  privacy: ProwlarrIndexerPrivacy;
  privacySource: ProwlarrPrivacySource;
  definitionFile?: string;
  baseUrl?: string;
  settings: Record<string, unknown>;
  cookies: Record<string, string>;
  cookieExpiration: string | null;
}

export interface FlareSolverrResult {
  html: string;
  status: number;
  url: string;
  headers: Record<string, string>;
}
