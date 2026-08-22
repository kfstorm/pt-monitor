import { useTranslation } from "react-i18next";

import type { SkippedSite } from "@/types";

interface DiscoveryDiagnosticsProps {
  skipped: SkippedSite[];
}

export function DiscoveryDiagnostics({ skipped }: DiscoveryDiagnosticsProps) {
  const { t } = useTranslation();
  const sorted = [...skipped].sort((a, b) =>
    a.prowlarrIndexerName.localeCompare(b.prowlarrIndexerName, undefined, {
      sensitivity: "base",
    }),
  );

  if (sorted.length === 0) return null;

  return (
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
                <td className="px-3 py-2 font-medium">{site.prowlarrIndexerName}</td>
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
  );
}
