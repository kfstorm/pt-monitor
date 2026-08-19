import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { MetricSelector } from "@/components/MetricSelector";
import i18n from "@/i18n";
import { METRICS, type MetricKey } from "@/lib/metrics";
import { useMetric } from "@/lib/use-metric";

const STORAGE_KEY = "pt-monitor.metric";

beforeEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage("en");
});

describe("useMetric", () => {
  it("defaults to bonusPerHour without a stored value", () => {
    const { result } = renderHook(() => useMetric());
    expect(result.current[0]).toBe("bonusPerHour");
  });

  it("reads a stored value and persists changes", () => {
    localStorage.setItem(STORAGE_KEY, "ratio");
    const { result } = renderHook(() => useMetric());
    expect(result.current[0]).toBe("ratio");

    act(() => {
      result.current[1]("bonus");
    });
    expect(result.current[0]).toBe("bonus");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("bonus");
  });

  it("falls back to the default for unknown stored values", () => {
    localStorage.setItem(STORAGE_KEY, "nope");
    const { result } = renderHook(() => useMetric());
    expect(result.current[0]).toBe("bonusPerHour");
  });
});

describe("MetricSelector", () => {
  it("shows the selected metric and switches on interaction", async () => {
    const user = userEvent.setup();
    let value: MetricKey = "bonusPerHour";
    const onChange = (next: MetricKey) => {
      value = next;
    };

    render(<MetricSelector value={value} onValueChange={onChange} />);

    expect(screen.getByRole("combobox", { name: "Trend metric" })).toHaveTextContent(
      i18n.t(METRICS.bonusPerHour.label),
    );

    await user.click(screen.getByRole("combobox", { name: "Trend metric" }));
    await user.click(
      await screen.findByRole("option", { name: i18n.t(METRICS.ratio.label) }),
    );

    expect(value).toBe("ratio");
  });
});
