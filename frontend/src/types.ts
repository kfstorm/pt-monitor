import type { AccountSnapshot } from "../../src/normalize.ts";

export type Site = Omit<AccountSnapshot, "prowlarrIndexerId" | "status" | "raw"> & {
  siteUrl?: string;
};
