import { fmtBytes, fmtNum, fmtRatio } from "./format";

export type MetricFormatter = (value: number | null, locale?: string) => string;

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
  bonusPerHour: { label: "metric.bonusPerHour", fmt: fmtNum },
  bonus: { label: "metric.bonus", fmt: fmtNum },
  ratio: {
    label: "metric.ratio",
    fmt: (value, locale) => fmtRatio(value, null, null, locale),
  },
  uploaded: { label: "metric.uploaded", fmt: fmtBytes },
  downloaded: { label: "metric.downloaded", fmt: fmtBytes },
  seedingCount: { label: "metric.seedingCount", fmt: fmtNum },
  seedingSize: { label: "metric.seedingSize", fmt: fmtBytes },
  seedingBonus: { label: "metric.seedingBonus", fmt: fmtNum },
  hnrUnsatisfied: { label: "metric.hnrUnsatisfied", fmt: fmtNum },
  hnrPreWarning: { label: "metric.hnrPreWarning", fmt: fmtNum },
};

export const METRIC_KEYS = Object.keys(METRICS) as MetricKey[];

export function isMetricKey(value: string): value is MetricKey {
  return value in METRICS;
}
