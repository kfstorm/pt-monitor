import { Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { collectNow, fetchHistory, fetchSites } from "@/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MetricSelector } from "@/components/MetricSelector";
import { SiteCard } from "@/components/SiteCard";
import { Summary } from "@/components/Summary";
import { fmtTime } from "@/lib/format";
import { useMetric } from "@/lib/use-metric";
import type { Site } from "@/types";

export default function App() {
  const [sites, setSites] = useState<Site[]>([]);
  const [histories, setHistories] = useState<Record<string, Site[]>>({});
  const [loading, setLoading] = useState(true);
  const [collecting, setCollecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useMetric();

  const load = useCallback(async () => {
    try {
      const nextSites = await fetchSites();
      setSites(nextSites);
      const entries = await Promise.all(
        nextSites.map(
          async (site) =>
            [site.definition, await fetchHistory(site.definition)] as const,
        ),
      );
      setHistories(Object.fromEntries(entries));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; setState only runs after await
    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, [load]);

  const refresh = useCallback(async () => {
    setCollecting(true);
    try {
      await collectNow();
      await load();
    } finally {
      setCollecting(false);
    }
  }, [load]);

  const updated = sites.length
    ? Math.max(...sites.map((site) => site.collectedAt))
    : null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">PT Monitor</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {updated ? `Last snapshot: ${fmtTime(updated)}` : "No snapshots yet"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MetricSelector value={metric} onValueChange={setMetric} />
          <Button onClick={() => void refresh()} disabled={collecting}>
            {collecting ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {collecting ? "Collecting…" : "Collect now"}
          </Button>
        </div>
      </header>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      <Summary sites={sites} />

      {loading ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : sites.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-border/60 px-6 py-16 text-center text-sm text-muted-foreground">
          No snapshots yet. Collection will run automatically, or press "Collect now".
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {sites.map((site) => (
            <SiteCard
              key={site.definition}
              site={site}
              history={histories[site.definition] ?? []}
              metricKey={metric}
            />
          ))}
        </div>
      )}
    </main>
  );
}
