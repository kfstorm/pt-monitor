import type { Site } from "@/types";

interface SummaryProps {
  sites: Site[];
}

export function Summary({ sites }: SummaryProps) {
  const healthy = sites.filter((site) => site.statusName === "success").length;
  const warnings = sites.filter((site) => site.statusName === "passParse").length;
  const failures = sites.length - healthy - warnings;

  const cards = [
    { label: "Sites", value: sites.length },
    { label: "Healthy", value: healthy },
    { label: "Warnings", value: warnings },
    { label: "Failures", value: failures },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-xl border border-border/50 bg-card px-4 py-3">
          <div className="text-2xl font-semibold tabular-nums">{card.value}</div>
          <div className="text-xs text-muted-foreground">{card.label}</div>
        </div>
      ))}
    </div>
  );
}