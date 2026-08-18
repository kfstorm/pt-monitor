import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { fmtBytes, fmtNum, fmtRatio, fmtTime } from "@/lib/format";
import { METRICS, type MetricKey } from "@/lib/metrics";
import { statusInfo } from "@/lib/status";
import type { Site } from "@/types";
import { TrendChart } from "./TrendChart";

interface SiteCardProps {
  site: Site;
  history: Site[];
  metricKey: MetricKey;
}

export function SiteCard({ site, history, metricKey }: SiteCardProps) {
  const status = statusInfo(site.statusName);

  const metrics: Array<[string, string]> = [
    ["Ratio", fmtRatio(site.ratio, site.uploaded, site.downloaded)],
    ["Uploaded", fmtBytes(site.uploaded)],
    ["Downloaded", fmtBytes(site.downloaded)],
    ["Bonus", fmtNum(site.bonus)],
    ["Bonus / hour", fmtNum(site.bonusPerHour)],
    ["Seeding", fmtNum(site.seedingCount)],
    ["Seeding size", fmtBytes(site.seedingSize)],
    ["Seeding bonus", fmtNum(site.seedingBonus)],
    ["H&R", fmtNum(site.hnrUnsatisfied)],
    ["H&R warning", fmtNum(site.hnrPreWarning)],
    ["Collected", fmtTime(site.collectedAt)],
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold">{site.definition}</div>
          <div className="truncate text-xs text-muted-foreground">
            {site.prowlarrIndexerName}
            {site.level ? ` · ${site.level}` : ""}
          </div>
        </div>
        <Badge variant="outline" className={status.className}>
          {status.label}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {metrics.map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
              <div className="text-[11px] text-muted-foreground">{label}</div>
              <div className="truncate font-medium tabular-nums">{value}</div>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <div className="mb-1 text-xs text-muted-foreground">{METRICS[metricKey].label}</div>
          <TrendChart history={history} metricKey={metricKey} />
        </div>
      </CardContent>
    </Card>
  );
}