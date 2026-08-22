import type { AccountSnapshot } from "../../src/normalize.ts";

export type Site = Omit<AccountSnapshot, "prowlarrIndexerId" | "status" | "raw">;

export type SkippedSiteReason = "no-match" | "ambiguous" | "dead";

export interface SkippedSite {
  prowlarrIndexerId: number;
  prowlarrIndexerName: string;
  reason: SkippedSiteReason;
  candidates?: string[];
}

export interface DiscoveryError {
  code: string;
  detail: string;
}

export interface DiscoveryMeta {
  status: "ready" | "error" | "disabled";
  updatedAt: string | null;
  error?: DiscoveryError;
}

export interface SitesResponse {
  sites: Site[];
  skipped: SkippedSite[];
  discovery: DiscoveryMeta;
}
