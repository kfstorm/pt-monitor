import { useCallback, useEffect, useState } from "react";

export type SortKey =
  | "definition"
  | "username"
  | "statusName"
  | "uploaded"
  | "ratio"
  | "seedingCount"
  | "seedingSize"
  | "bonus"
  | "collectedAt";

export type SiteSort = {
  key: SortKey;
  dir: "asc" | "desc";
};

const SORT_KEYS: readonly SortKey[] = [
  "definition",
  "username",
  "statusName",
  "uploaded",
  "ratio",
  "seedingCount",
  "seedingSize",
  "bonus",
  "collectedAt",
];

const DEFAULT_SORT: SiteSort = { key: "definition", dir: "asc" };

const STORAGE_KEY = "pt-monitor.sort";

function isSortKey(value: string): value is SortKey {
  return (SORT_KEYS as readonly string[]).includes(value);
}

function readStoredSort(): SiteSort {
  if (typeof window === "undefined") return DEFAULT_SORT;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) return DEFAULT_SORT;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed === "object" && parsed !== null) {
      const { key, dir } = parsed as { key?: unknown; dir?: unknown };
      if (
        typeof key === "string" &&
        isSortKey(key) &&
        (dir === "asc" || dir === "desc")
      ) {
        return { key, dir };
      }
    }
  } catch {
    // corrupted value; fall back to the default
  }
  return DEFAULT_SORT;
}

export function useSiteSort(): [SiteSort, (key: SortKey) => void] {
  const [sort, setSort] = useState<SiteSort>(readStoredSort);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sort));
  }, [sort]);

  const cycle = useCallback((key: SortKey) => {
    setSort((prev) =>
      prev.key !== key
        ? { key, dir: "asc" }
        : prev.dir === "asc"
          ? { key, dir: "desc" }
          : DEFAULT_SORT,
    );
  }, []);

  return [sort, cycle];
}
