import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TrendChart, TrendTooltipContent } from "@/components/TrendChart";
import type { Site } from "@/types";

function point(collectedAt: number, value: number | null): Site {
  return {
    definition: "hdtime",
    prowlarrIndexerName: "HDTime",
    collectedAt,
    statusName: "success",
    uploaded: value,
    downloaded: null,
    ratio: null,
    bonus: null,
    seedingBonus: null,
    bonusPerHour: value,
    seedingCount: null,
    seedingSize: null,
    hnrUnsatisfied: null,
    hnrPreWarning: null,
    username: null,
    level: null,
  };
}

describe("TrendChart", () => {
  it("shows a placeholder with fewer than two plottable points", () => {
    render(<TrendChart history={[point(1, 5)]} metricKey="bonusPerHour" />);
    expect(screen.getByText("Not enough history to draw")).toBeInTheDocument();
  });

  it("renders an SVG line chart with enough history", () => {
    const history = [
      point(1000, 1),
      point(2000, 2),
      point(3000, 3),
      point(4000, 4),
      point(5000, 5),
    ];
    render(<TrendChart history={history} metricKey="bonusPerHour" />);

    const chart = document.querySelector('[data-slot="chart"]');
    expect(chart).not.toBeNull();
    expect(chart!.querySelector("svg")).not.toBeNull();
  });

  it("breaks the line across missing data instead of dropping points", () => {
    const history = [point(1000, 1), point(2000, 2), point(3000, null), point(4000, 4)];
    render(<TrendChart history={history} metricKey="bonusPerHour" />);

    const chart = document.querySelector('[data-slot="chart"]');
    expect(chart!.querySelector("svg")).not.toBeNull();
  });

  it("renders a formatted tooltip title and value", () => {
    render(
      <TrendTooltipContent
        active={true}
        payload={[{ payload: { collectedAt: 1787060233184, value: 8555299975725 } }]}
        metricKey="uploaded"
      />,
    );

    expect(screen.getByText("8/18 21:37")).toBeInTheDocument();
    expect(screen.getByText("Uploaded")).toBeInTheDocument();
    expect(screen.getByText("7.78 TiB")).toBeInTheDocument();
  });

  it("renders nothing when inactive or missing value", () => {
    const { container } = render(
      <TrendTooltipContent
        active={false}
        payload={[{ payload: { collectedAt: 1787060233184, value: 5 } }]}
        metricKey="ratio"
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});