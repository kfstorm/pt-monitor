import { render, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { SiteList } from "@/components/SiteList";
import i18n from "@/i18n";
import type { Site } from "@/types";

function site(partial: Partial<Site>): Site {
  return {
    definition: "hdtime",
    prowlarrIndexerName: "HDTime",
    collectedAt: 1000,
    statusName: "success",
    uploaded: null,
    downloaded: null,
    ratio: null,
    bonus: null,
    seedingBonus: null,
    bonusPerHour: null,
    seedingCount: null,
    seedingSize: null,
    hnrUnsatisfied: null,
    hnrPreWarning: null,
    username: null,
    level: null,
    ...partial,
  };
}

function renderList(sites: Site[]) {
  return render(<SiteList sites={sites} histories={{}} metricKey="bonusPerHour" />);
}

function definitions(container: HTMLElement): string[] {
  return Array.from(
    container.querySelectorAll("tbody tr td:first-child div:first-child"),
  ).map((el) => el.textContent ?? "");
}

function trafficHeader(container: HTMLElement) {
  return within(container).getByRole("button", { name: /traffic/i });
}

beforeEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage("en");
});

describe("SiteList", () => {
  it("sorts by site name ascending by default", () => {
    const { container } = renderList([
      site({ definition: "mteam", prowlarrIndexerName: "MTeam" }),
      site({ definition: "chdbits", prowlarrIndexerName: "CHDBits" }),
      site({ definition: "hdtime", prowlarrIndexerName: "HDTime" }),
    ]);
    expect(definitions(container)).toEqual(["chdbits", "hdtime", "mteam"]);
  });

  it("cycles asc/desc on repeated header clicks", async () => {
    const user = userEvent.setup();
    const { container } = renderList([
      site({ definition: "a", uploaded: 10 }),
      site({ definition: "b", uploaded: 30 }),
      site({ definition: "c", uploaded: 20 }),
    ]);

    await user.click(trafficHeader(container));
    expect(definitions(container)).toEqual(["a", "c", "b"]);

    await user.click(trafficHeader(container));
    expect(definitions(container)).toEqual(["b", "c", "a"]);
  });

  it("keeps null values at the end regardless of direction", async () => {
    const user = userEvent.setup();
    const { container } = renderList([
      site({ definition: "a", uploaded: null }),
      site({ definition: "b", uploaded: 5 }),
      site({ definition: "c", uploaded: 10 }),
    ]);

    await user.click(trafficHeader(container));
    expect(definitions(container)).toEqual(["b", "c", "a"]);

    await user.click(trafficHeader(container));
    expect(definitions(container)).toEqual(["c", "b", "a"]);
  });

  it("returns to the default sort after cycling a column twice", async () => {
    const user = userEvent.setup();
    const { container } = renderList([
      site({ definition: "mteam", uploaded: 10 }),
      site({ definition: "chdbits", uploaded: 5 }),
      site({ definition: "hdtime", uploaded: 20 }),
    ]);

    await user.click(trafficHeader(container));
    await user.click(trafficHeader(container));
    await user.click(trafficHeader(container));
    expect(definitions(container)).toEqual(["chdbits", "hdtime", "mteam"]);
  });

  it("restores a persisted sort preference", () => {
    localStorage.setItem(
      "pt-monitor.sort",
      JSON.stringify({ key: "bonus", dir: "desc" }),
    );
    const { container } = renderList([
      site({ definition: "a", bonus: 10 }),
      site({ definition: "b", bonus: 30 }),
      site({ definition: "c", bonus: 20 }),
    ]);
    expect(definitions(container)).toEqual(["b", "c", "a"]);
  });

  it("shows HnR icons only when counts are positive", () => {
    const { container } = renderList([
      site({ definition: "a", hnrUnsatisfied: 1, hnrPreWarning: 0 }),
      site({ definition: "b", hnrPreWarning: 2 }),
    ]);
    expect(container.querySelectorAll('[data-hnr="unsatisfied"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-hnr="warning"]')).toHaveLength(1);
  });

  it("formats the stacked traffic and bonus cells", () => {
    const { container } = renderList([
      site({ definition: "a", uploaded: 2048, downloaded: 1024, bonus: 1234.5 }),
    ]);
    const rows = container.querySelectorAll("tbody tr");
    expect(rows[0].textContent).toContain("2.00 KiB");
    expect(rows[0].textContent).toContain("1.00 KiB");
    expect(rows[0].textContent).toContain("1,234.5");
  });
});
