import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

import { fmtTime } from "@/lib/format";
import type { DiscoveryMeta, SkippedSite } from "@/types";

interface DiscoveryDiagnosticsProps {
  skipped: SkippedSite[];
  discovery: DiscoveryMeta;
}

function updatedTime(value: string | null, locale: string): string {
  return value ? fmtTime(new Date(value).getTime(), locale) : fmtTime(null, locale);
}

export function DiscoveryDiagnostics({
  skipped,
  discovery,
}: DiscoveryDiagnosticsProps) {
  const { t, i18n } = useTranslation();
  const sorted = [...skipped].sort((a, b) =>
    a.prowlarrIndexerName.localeCompare(b.prowlarrIndexerName, undefined, {
      sensitivity: "base",
    }),
  );

  return (
    <>
      {discovery.status === "error" && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" />
          <div>
            <p className="font-medium">{t("discovery.error.title")}</p>
            <p className="text-muted-foreground">
              {t("discovery.error.lastSuccess", {
                time: updatedTime(discovery.updatedAt, i18n.language),
              })}
            </p>
            {discovery.error?.detail && (
              <details className="mt-1 text-muted-foreground">
                <summary className="cursor-pointer">
                  {t("discovery.error.details")}
                </summary>
                <p className="mt-1 break-words text-xs">{discovery.error.detail}</p>
              </details>
            )}
          </div>
        </div>
      )}

      {discovery.status !== "disabled" && sorted.length > 0 && (
        <details className="mt-6 overflow-hidden rounded-xl border border-border/50 bg-card">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium marker:hidden">
            {t("discovery.skipped.title", { count: sorted.length })}
          </summary>
          <div className="overflow-x-auto border-t border-border/50">
            <table className="w-full min-w-[620px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/50 text-left">
                  <th scope="col" className="bg-muted/50 px-3 py-2 text-xs font-medium">
                    {t("discovery.skipped.site")}
                  </th>
                  <th scope="col" className="bg-muted/50 px-3 py-2 text-xs font-medium">
                    {t("discovery.skipped.reason")}
                  </th>
                  <th scope="col" className="bg-muted/50 px-3 py-2 text-xs font-medium">
                    {t("discovery.skipped.candidates")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((site) => (
                  <tr
                    key={site.prowlarrIndexerId}
                    className="border-b border-border/50 last:border-0"
                  >
                    <td className="px-3 py-2 font-medium">
                      {site.prowlarrIndexerName}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {t(`discovery.reason.${site.reason}`)}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {site.candidates?.join(", ") ?? "–"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </>
  );
}
