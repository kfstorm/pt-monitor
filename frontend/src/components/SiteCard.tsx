import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useTranslation } from "react-i18next";

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
  const { t, i18n } = useTranslation();
  const status = statusInfo(site.statusName, t);
  const locale = i18n.language;

  const metrics: Array<[string, string]> = [
    [t("metric.ratio"), fmtRatio(site.ratio, site.uploaded, site.downloaded, locale)],
    [t("metric.uploaded"), fmtBytes(site.uploaded, locale)],
    [t("metric.downloaded"), fmtBytes(site.downloaded, locale)],
    [t("metric.bonus"), fmtNum(site.bonus, locale)],
    [t("metric.bonusPerHour"), fmtNum(site.bonusPerHour, locale)],
    [t("metric.seedingCount"), fmtNum(site.seedingCount, locale)],
    [t("metric.seedingSize"), fmtBytes(site.seedingSize, locale)],
    [t("metric.seedingBonus"), fmtNum(site.seedingBonus, locale)],
    [t("metric.hnrUnsatisfied"), fmtNum(site.hnrUnsatisfied, locale)],
    [t("metric.hnrPreWarning"), fmtNum(site.hnrPreWarning, locale)],
    [t("metric.collected"), fmtTime(site.collectedAt, locale)],
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
            <div
              key={label}
              className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2"
            >
              <div className="text-[11px] text-muted-foreground">{label}</div>
              <div className="truncate font-medium tabular-nums">{value}</div>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <div className="mb-1 text-xs text-muted-foreground">
            {t(METRICS[metricKey].label)}
          </div>
          <TrendChart history={history} metricKey={metricKey} />
        </div>
      </CardContent>
    </Card>
  );
}
