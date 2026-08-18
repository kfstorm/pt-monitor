import { describe, expect, it } from "vitest";

import { METRICS, METRIC_KEYS, isMetricKey } from "./metrics";

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
    }
  });

  it("validates metric keys", () => {
    expect(isMetricKey("ratio")).toBe(true);
    expect(isMetricKey("nope")).toBe(false);
  });
});
