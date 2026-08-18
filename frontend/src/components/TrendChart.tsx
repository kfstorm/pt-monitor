import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { fmtDay } from "@/lib/format";
import { METRICS, type MetricKey } from "@/lib/metrics";
import type { Site } from "@/types";

interface TrendChartProps {
  history: Site[];
  metricKey: MetricKey;
}

interface ChartPoint {
  collectedAt: number;
  value: number | null;
}

interface TrendTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: ChartPoint }>;
  metricKey: MetricKey;
}

export function TrendTooltipContent({ active, payload, metricKey }: TrendTooltipProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  if (!point || point.value == null) return null;

  const meta = METRICS[metricKey];
  return (
    <div className="rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium">{fmtDay(point.collectedAt)}</div>
      <div className="mt-0.5 flex items-center gap-1.5">
        <span className="h-2 w-2 shrink-0 rounded-[2px] bg-(--chart-1)" />
        <span className="text-muted-foreground">{meta.label}</span>
        <span className="font-mono font-medium tabular-nums">{meta.fmt(point.value)}</span>
      </div>
    </div>
  );
}

export function TrendChart({ history, metricKey }: TrendChartProps) {
  const meta = METRICS[metricKey];

  const config: ChartConfig = useMemo(
    () => ({ [metricKey]: { label: meta.label, color: "var(--chart-1)" } }),
    [metricKey, meta.label],
  );

  const data = useMemo<ChartPoint[]>(() => {
    return history
      .map((point) => {
        const raw = point[metricKey];
        const value = raw != null && Number.isFinite(Number(raw)) ? Number(raw) : null;
        return { collectedAt: point.collectedAt, value };
      })
      .filter((point) => point.collectedAt != null);
  }, [history, metricKey]);

  if (data.filter((point) => point.value != null).length < 2) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        Not enough history to draw
      </div>
    );
  }

  return (
    <ChartContainer config={config} className="aspect-[16/7]">
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="collectedAt"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          tickFormatter={fmtDay}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <YAxis
          tickFormatter={(value: number) => meta.fmt(value)}
          width={64}
          tickLine={false}
          axisLine={false}
          domain={["auto", "auto"]}
        />
        <ChartTooltip
          content={({ active, payload }) => (
            <TrendTooltipContent
              active={active}
              payload={payload as TrendTooltipProps["payload"]}
              metricKey={metricKey}
            />
          )}
        />
        <Line
          dataKey="value"
          type="monotone"
          stroke="var(--chart-1)"
          strokeWidth={1.6}
          dot={false}
          connectNulls={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  );
}