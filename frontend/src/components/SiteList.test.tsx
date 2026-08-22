import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  return render(
    <SiteList
      sites={sites}
      histories={{}}
      metricKey="bonusPerHour"
      onMetricChange={() => {}}
    />,
  );
}

function definitions(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("tbody tr[data-definition]")).map(
    (el) => el.getAttribute("data-definition") ?? "",
  );
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

  it("renders the status badge inside the site column", () => {
    const { container } = renderList([site({ statusName: "needLogin" })]);
    const cell = container.querySelector("tbody td:first-child");
    expect(cell?.textContent).toContain("Login failed");
  });

  it("shows the site name without the definition id", () => {
    const { container } = renderList([
      site({ definition: "chdbits", prowlarrIndexerName: "CHDBits" }),
    ]);
    const cell = container.querySelector("tbody td:first-child");
    expect(cell?.textContent).toContain("CHDBits");
    expect(cell?.textContent).not.toContain("chdbits");
  });

  it("links the site name to its URL in a new tab", () => {
    const { container } = renderList([
      site({
        prowlarrIndexerName: "CHDBits",
        siteUrl: "https://chdbits.example/pt?source=monitor#home",
      }),
    ]);
    const link = within(container).getByRole("link", { name: /CHDBits/i });

    expect(link).toHaveAttribute(
      "href",
      "https://chdbits.example/pt?source=monitor#home",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute(
      "title",
      "https://chdbits.example/pt?source=monitor#home",
    );
    expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("keeps the site name as plain text when no URL is available", () => {
    const { container } = renderList([site({ prowlarrIndexerName: "CHDBits" })]);

    expect(within(container).queryByRole("link", { name: /CHDBits/i })).toBeNull();
    expect(container.querySelector("tbody td:first-child")?.textContent).toContain(
      "CHDBits",
    );
  });

  it("renders all columns without responsive hiding", () => {
    const { container } = renderList([site({})]);
    expect(container.querySelectorAll("thead th.hidden, tbody td.hidden")).toHaveLength(
      0,
    );
  });

  it("switches the trend metric from the column header", async () => {
    const user = userEvent.setup();
    const onMetricChange = vi.fn();
    const { container } = render(
      <SiteList
        sites={[]}
        histories={{}}
        metricKey="bonusPerHour"
        onMetricChange={onMetricChange}
      />,
    );

    await user.click(within(container).getByRole("combobox", { name: "Trend metric" }));
    await user.click(await screen.findByRole("option", { name: "Ratio" }));

    expect(onMetricChange).toHaveBeenCalledWith("ratio");
  });
});
