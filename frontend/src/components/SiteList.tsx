import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
} from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { TrendChart } from "@/components/TrendChart";
import { Badge } from "@/components/ui/badge";
import { fmtBytes, fmtNum, fmtRatio, fmtTime } from "@/lib/format";
import type { MetricKey } from "@/lib/metrics";
import { statusInfo } from "@/lib/status";
import { useSiteSort, type SiteSort, type SortKey } from "@/lib/use-sort";
import { cn } from "@/lib/utils";
import type { Site } from "@/types";

interface SiteListProps {
  sites: Site[];
  histories: Record<string, Site[]>;
  metricKey: MetricKey;
}

const STATUS_RANK: Record<string, number> = {
  success: 0,
  passParse: 1,
};

function statusRank(name: string): number {
  return STATUS_RANK[name] ?? 2;
}

function compareSites(a: Site, b: Site, sort: SiteSort): number {
  const dir = sort.dir === "asc" ? 1 : -1;
  const av = a[sort.key];
  const bv = b[sort.key];

  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;

  if (sort.key === "statusName") {
    const rank = statusRank(String(av)) - statusRank(String(bv));
    return rank !== 0 ? dir * rank : dir * String(av).localeCompare(String(bv));
  }

  if (typeof av === "string" && typeof bv === "string") {
    return dir * av.localeCompare(bv, undefined, { sensitivity: "base" });
  }
  return dir * (Number(av) - Number(bv));
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  className,
  align = "end",
}: {
  label: string;
  sortKey?: SortKey;
  sort?: SiteSort;
  onSort?: (key: SortKey) => void;
  className?: string;
  align?: "start" | "end";
}) {
  const active = sortKey != null && sort?.key === sortKey;
  const Icon = active ? (sort!.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  const content =
    sortKey == null || onSort == null ? (
      <span className="text-muted-foreground">{label}</span>
    ) : (
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "group/sort inline-flex items-center gap-1 rounded font-medium whitespace-nowrap transition-colors hover:text-foreground",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
        <Icon
          className={cn(
            "size-3 shrink-0",
            active
              ? "text-foreground"
              : "text-muted-foreground/60 group-hover/sort:text-foreground",
          )}
        />
      </button>
    );

  return (
    <th
      scope="col"
      aria-sort={
        active ? (sort?.dir === "asc" ? "ascending" : "descending") : undefined
      }
      className={cn(
        "bg-muted/50 px-3 py-2 text-xs font-medium",
        align === "end" ? "text-right" : "text-left",
        className,
      )}
    >
      {content}
    </th>
  );
}

const siteCell =
  "sticky left-0 z-10 border-r border-border/50 bg-card px-3 py-2 transition-colors";

export function SiteList({ sites, histories, metricKey }: SiteListProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const [sort, cycleSort] = useSiteSort();

  const sorted = useMemo(
    () => [...sites].sort((a, b) => compareSites(a, b, sort)),
    [sites, sort],
  );

  return (
    <div className="overflow-hidden rounded-xl border border-border/50 bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border/50">
              <SortHeader
                label={t("table.site")}
                sortKey="definition"
                sort={sort}
                onSort={cycleSort}
                align="start"
                className="sticky left-0 z-20 w-40 border-r border-border/50"
              />
              <SortHeader
                label={t("table.status")}
                sortKey="statusName"
                sort={sort}
                onSort={cycleSort}
                align="start"
                className="w-24"
              />
              <SortHeader
                label={t("table.user")}
                sortKey="username"
                sort={sort}
                onSort={cycleSort}
                align="start"
                className="hidden w-28 lg:table-cell"
              />
              <SortHeader
                label={t("table.traffic")}
                sortKey="uploaded"
                sort={sort}
                onSort={cycleSort}
              />
              <SortHeader
                label={t("metric.ratio")}
                sortKey="ratio"
                sort={sort}
                onSort={cycleSort}
              />
              <SortHeader
                label={t("metric.seedingCount")}
                sortKey="seedingCount"
                sort={sort}
                onSort={cycleSort}
              />
              <SortHeader
                label={t("metric.seedingSize")}
                sortKey="seedingSize"
                sort={sort}
                onSort={cycleSort}
                className="hidden lg:table-cell"
              />
              <SortHeader
                label={t("metric.bonus")}
                sortKey="bonus"
                sort={sort}
                onSort={cycleSort}
              />
              <SortHeader label={t("table.trend")} className="hidden md:table-cell" />
              <SortHeader
                label={t("metric.collected")}
                sortKey="collectedAt"
                sort={sort}
                onSort={cycleSort}
                className="hidden md:table-cell"
              />
            </tr>
          </thead>
          <tbody>
            {sorted.map((site) => {
              const status = statusInfo(site.statusName, t);
              const hasPreWarning = (site.hnrPreWarning ?? 0) > 0;
              const hasUnsatisfied = (site.hnrUnsatisfied ?? 0) > 0;
              return (
                <tr
                  key={site.definition}
                  className="group/row border-b border-border/50 transition-colors last:border-0 hover:bg-muted/30"
                >
                  <td className={cn(siteCell, "group-hover/row:bg-muted/30")}>
                    <div className="max-w-36 truncate font-medium">
                      {site.definition}
                    </div>
                    <div className="max-w-36 truncate text-xs text-muted-foreground">
                      {site.prowlarrIndexerName}
                    </div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Badge variant="outline" className={status.className}>
                      {status.label}
                    </Badge>
                  </td>
                  <td className="hidden px-3 py-2 whitespace-nowrap lg:table-cell">
                    <div className="max-w-28 truncate">{site.username ?? "–"}</div>
                    <div className="max-w-28 truncate text-xs text-muted-foreground">
                      {site.level ?? "–"}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1 tabular-nums">
                      {fmtBytes(site.uploaded, locale)}
                      <ArrowUp className="size-3 shrink-0 text-emerald-500" />
                    </div>
                    <div className="flex items-center justify-end gap-1 text-muted-foreground tabular-nums">
                      {fmtBytes(site.downloaded, locale)}
                      <ArrowDown className="size-3 shrink-0 text-destructive" />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                    {fmtRatio(site.ratio, site.uploaded, site.downloaded, locale)}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1 tabular-nums">
                      {fmtNum(site.seedingCount, locale)}
                      {hasPreWarning && (
                        <AlertTriangle
                          data-hnr="warning"
                          className="size-3 shrink-0 text-amber-500"
                        />
                      )}
                      {hasUnsatisfied && (
                        <AlertCircle
                          data-hnr="unsatisfied"
                          className="size-3 shrink-0 text-destructive"
                        />
                      )}
                    </div>
                  </td>
                  <td className="hidden px-3 py-2 text-right whitespace-nowrap tabular-nums lg:table-cell">
                    {fmtBytes(site.seedingSize, locale)}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <div className="tabular-nums">{fmtNum(site.bonus, locale)}</div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {fmtNum(site.seedingBonus, locale)}
                    </div>
                  </td>
                  <td className="hidden px-3 py-2 md:table-cell">
                    <TrendChart
                      history={histories[site.definition] ?? []}
                      metricKey={metricKey}
                      className="h-14 w-44"
                    />
                  </td>
                  <td className="hidden px-3 py-2 text-xs whitespace-nowrap text-right text-muted-foreground md:table-cell">
                    {fmtTime(site.collectedAt, locale)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
