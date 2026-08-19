import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Line, LineChart } from "recharts";

import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import i18n from "@/i18n";
import { fmtDay } from "@/lib/format";
import { METRICS, type MetricKey } from "@/lib/metrics";
import { cn } from "@/lib/utils";
import type { Site } from "@/types";

interface TrendChartProps {
  history: Site[];
  metricKey: MetricKey;
  className?: string;
}

interface ChartPoint {
  collectedAt: number;
  value: number | null;
}

interface TrendTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: ChartPoint }>;
  metricKey: MetricKey;
  locale?: string;
  translate?: (key: string) => string;
}

export function TrendTooltipContent({
  active,
  payload,
  metricKey,
  locale = i18n.language,
  translate = (key) => i18n.t(key),
}: TrendTooltipProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  if (!point || point.value == null) return null;

  const meta = METRICS[metricKey];
  return (
    <div className="rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium">{fmtDay(point.collectedAt, locale)}</div>
      <div className="mt-0.5 flex items-center gap-1.5">
        <span className="h-2 w-2 shrink-0 rounded-[2px] bg-(--chart-1)" />
        <span className="text-muted-foreground">{translate(meta.label)}</span>
        <span className="font-mono font-medium tabular-nums">
          {meta.fmt(point.value, locale)}
        </span>
      </div>
    </div>
  );
}

export function TrendChart({ history, metricKey, className }: TrendChartProps) {
  const { t, i18n } = useTranslation();
  const meta = METRICS[metricKey];
  const locale = i18n.language;

  const config: ChartConfig = useMemo(
    () => ({ [metricKey]: { label: t(meta.label), color: "var(--chart-1)" } }),
    [metricKey, meta.label, t],
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
      <div
        className={cn(
          "flex h-40 items-center justify-center text-sm text-muted-foreground",
          className,
        )}
      >
        {t("chart.notEnoughHistory")}
      </div>
    );
  }

  const lastPlottable = [...data].reverse().find((point) => point.value != null);

  return (
    <ChartContainer config={config} className={className}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
        <ChartTooltip
          content={({ active, payload }) => (
            <TrendTooltipContent
              active={active}
              payload={payload as TrendTooltipProps["payload"]}
              metricKey={metricKey}
              locale={locale}
              translate={t}
            />
          )}
        />
        <Line
          dataKey="value"
          type="monotone"
          stroke="var(--chart-1)"
          strokeWidth={2}
          connectNulls={false}
          isAnimationActive={false}
          dot={(props) => {
            const point = props.payload as ChartPoint | undefined;
            if (
              point == null ||
              lastPlottable == null ||
              point.collectedAt !== lastPlottable.collectedAt ||
              props.cx == null ||
              props.cy == null
            ) {
              return null;
            }
            return (
              <circle
                cx={props.cx}
                cy={props.cy}
                r={2.5}
                fill="var(--chart-1)"
                stroke="var(--background)"
                strokeWidth={1.5}
              />
            );
          }}
        />
      </LineChart>
    </ChartContainer>
  );
}
