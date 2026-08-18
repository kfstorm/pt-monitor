import type { Site } from "@/types";

function toNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isNaN(n) ? null : n;
}

function parseSite(raw: Site): Site {
  return {
    ...raw,
    collectedAt: toNumber(raw.collectedAt) ?? 0,
    uploaded: toNumber(raw.uploaded),
    downloaded: toNumber(raw.downloaded),
    ratio: toNumber(raw.ratio),
    bonus: toNumber(raw.bonus),
    seedingBonus: toNumber(raw.seedingBonus),
    bonusPerHour: toNumber(raw.bonusPerHour),
    seedingCount: toNumber(raw.seedingCount),
    seedingSize: toNumber(raw.seedingSize),
    hnrUnsatisfied: toNumber(raw.hnrUnsatisfied),
    hnrPreWarning: toNumber(raw.hnrPreWarning),
  };
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export function fetchSites(): Promise<Site[]> {
  return request<Site[]>("/api/sites").then((sites) => sites.map(parseSite));
}

export function fetchHistory(definition: string): Promise<Site[]> {
  const url = `/api/sites/${encodeURIComponent(definition)}/history?hours=168`;
  return request<Site[]>(url).then((points) => points.map(parseSite));
}

export function collectNow(): Promise<unknown> {
  return request("/api/collect", { method: "POST" });
}