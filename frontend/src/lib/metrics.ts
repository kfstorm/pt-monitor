import { fmtBytes, fmtNum, fmtRatio } from "./format";

export type MetricFormatter = (value: number | null) => string;

export interface MetricDef {
  label: string;
  fmt: MetricFormatter;
}

export type MetricKey =
  | "bonusPerHour"
  | "bonus"
  | "ratio"
  | "uploaded"
  | "downloaded"
  | "seedingCount"
  | "seedingSize"
  | "seedingBonus"
  | "hnrUnsatisfied"
  | "hnrPreWarning";

export const METRICS: Record<MetricKey, MetricDef> = {
  bonusPerHour: { label: "Bonus / hour", fmt: fmtNum },
  bonus: { label: "Bonus", fmt: fmtNum },
  ratio: { label: "Ratio", fmt: (value) => fmtRatio(value) },
  uploaded: { label: "Uploaded", fmt: fmtBytes },
  downloaded: { label: "Downloaded", fmt: fmtBytes },
  seedingCount: { label: "Seeding", fmt: fmtNum },
  seedingSize: { label: "Seeding size", fmt: fmtBytes },
  seedingBonus: { label: "Seeding bonus", fmt: fmtNum },
  hnrUnsatisfied: { label: "H&R", fmt: fmtNum },
  hnrPreWarning: { label: "H&R warning", fmt: fmtNum },
};

export const METRIC_KEYS = Object.keys(METRICS) as MetricKey[];

export function isMetricKey(value: string): value is MetricKey {
  return value in METRICS;
}