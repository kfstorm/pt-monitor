import type { AccountSnapshot } from "../../src/normalize.ts";

export type Site = Omit<AccountSnapshot, "prowlarrIndexerId" | "status" | "raw"> & {
  siteUrl?: string;
};

export type SkippedSiteReason = "no-match" | "ambiguous" | "dead";

export interface SkippedSite {
  prowlarrIndexerId: number;
  prowlarrIndexerName: string;
  reason: SkippedSiteReason;
  candidates?: string[];
}

export interface SitesResponse {
  sites: Site[];
  skipped: SkippedSite[];
}
