import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { DiscoveryDiagnostics } from "@/components/DiscoveryDiagnostics";
import i18n from "@/i18n";
import type { SkippedSite } from "@/types";

function renderDiagnostics(skipped: SkippedSite[]) {
  return render(<DiscoveryDiagnostics skipped={skipped} />);
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

describe("DiscoveryDiagnostics", () => {
  it("hides the section when discovery has no skipped sites", () => {
    renderDiagnostics([]);
    expect(screen.queryByText(/Unmonitored Prowlarr sites/)).not.toBeInTheDocument();
  });

  it("renders all structured reasons and candidates in a collapsed section", () => {
    renderDiagnostics([
      { prowlarrIndexerId: 3, prowlarrIndexerName: "Zulu", reason: "dead" },
      { prowlarrIndexerId: 2, prowlarrIndexerName: "Bravo", reason: "no-match" },
      {
        prowlarrIndexerId: 1,
        prowlarrIndexerName: "Alpha",
        reason: "ambiguous",
        candidates: ["foo", "foopt"],
      },
    ]);

    const details = screen
      .getByText("Unmonitored Prowlarr sites · 3")
      .closest("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
    expect(details?.textContent).toContain("No matching PT-depiler site definition");
    expect(details?.textContent).toContain("Multiple matching definitions");
    expect(details?.textContent).toContain("Matching definition is marked dead");
    expect(details?.textContent).toContain("foo, foopt");
    expect(details?.textContent?.indexOf("Alpha")).toBeLessThan(
      details?.textContent?.indexOf("Bravo") ?? 0,
    );
  });
});
