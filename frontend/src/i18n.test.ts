import { beforeEach, describe, expect, it } from "vitest";

import i18n from "@/i18n";

describe("i18n", () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage("en");
  });

  it("switches between the PT-depiler terminology in English and Chinese", async () => {
    expect(i18n.t("metric.bonusPerHour")).toBe("Bonus Gained Per Hour");
    expect(i18n.t("metric.seedingBonus")).toBe("Seed Points");
    expect(i18n.t("table.site")).toBe("Site");
    expect(i18n.t("table.user")).toBe("User");
    expect(i18n.t("table.traffic")).toBe("Traffic");

    await i18n.changeLanguage("zh");

    expect(i18n.t("metric.bonusPerHour")).toBe("时魔值");
    expect(i18n.t("metric.seedingBonus")).toBe("做种积分");
    expect(i18n.t("table.site")).toBe("站点");
    expect(i18n.t("table.user")).toBe("用户");
    expect(i18n.t("table.traffic")).toBe("流量");
  });

  it("persists the selected language in local storage", async () => {
    await i18n.changeLanguage("zh");

    expect(localStorage.getItem("pt-monitor.language")).toBe("zh");
  });
});
