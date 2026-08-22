import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { DiscoveryDiagnostics } from "@/components/DiscoveryDiagnostics";
import i18n from "@/i18n";
import type { DiscoveryMeta, SkippedSite } from "@/types";

const ready: DiscoveryMeta = { status: "ready", updatedAt: "2026-08-22T12:00:00.000Z" };

function renderDiagnostics(skipped: SkippedSite[], discovery = ready) {
  return render(<DiscoveryDiagnostics skipped={skipped} discovery={discovery} />);
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("DiscoveryDiagnostics", () => {
  it("hides the section when discovery has no skipped sites", () => {
    renderDiagnostics([]);
    expect(screen.queryByText(/Unmonitored Prowlarr sites/)).not.toBeInTheDocument();
  });

  it("renders skipped sites collapsed and sorted by Prowlarr name", () => {
    renderDiagnostics([
      { prowlarrIndexerId: 2, prowlarrIndexerName: "Zulu", reason: "dead" },
      {
        prowlarrIndexerId: 1,
        prowlarrIndexerName: "Alpha",
        reason: "ambiguous",
        candidates: ["foo", "foopt"],
      },
    ]);

    const details = screen
      .getByText("Unmonitored Prowlarr sites · 2")
      .closest("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
    expect(details?.textContent).toContain("Alpha");
    expect(details?.textContent).toContain("foo, foopt");
    expect(details?.textContent?.indexOf("Alpha")).toBeLessThan(
      details?.textContent?.indexOf("Zulu") ?? 0,
    );
  });

  it("shows an independent warning for discovery errors and keeps stale rows", () => {
    renderDiagnostics(
      [{ prowlarrIndexerId: 1, prowlarrIndexerName: "Alpha", reason: "no-match" }],
      {
        status: "error",
        updatedAt: "2026-08-22T12:00:00.000Z",
        error: { code: "discovery-failed", detail: "database unavailable" },
      },
    );

    expect(screen.getByRole("alert")).toHaveTextContent("temporarily unavailable");
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("database unavailable")).toBeInTheDocument();
  });
});
