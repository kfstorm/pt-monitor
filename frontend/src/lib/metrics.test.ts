import { describe, expect, it } from "vitest";

import { METRICS, METRIC_KEYS, isMetricKey } from "./metrics";
import i18n from "@/i18n";

describe("METRICS", () => {
  it("exposes the ten selectable trend metrics", () => {
    expect(METRIC_KEYS).toEqual([
      "bonusPerHour",
      "bonus",
      "ratio",
      "uploaded",
      "downloaded",
      "seedingCount",
      "seedingSize",
      "seedingBonus",
      "hnrUnsatisfied",
      "hnrPreWarning",
    ]);
    for (const key of METRIC_KEYS) {
      expect(typeof METRICS[key].label).toBe("string");
      expect(typeof METRICS[key].fmt).toBe("function");
      expect(i18n.t(METRICS[key].label)).not.toBe(METRICS[key].label);
    }
  });

  it("validates metric keys", () => {
    expect(isMetricKey("ratio")).toBe(true);
    expect(isMetricKey("nope")).toBe(false);
  });
});
