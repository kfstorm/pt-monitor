import { describe, expect, it } from "vitest";

import i18n from "@/i18n";
import { statusInfo } from "@/lib/status";

describe("statusInfo", () => {
  it("translates every backend status", async () => {
    await i18n.changeLanguage("zh");

    expect(statusInfo("working", i18n.t).label).toBe("处理中");
    expect(statusInfo("parseError", i18n.t).label).toBe("解析失败");
    expect(statusInfo("noResults", i18n.t).label).toBe("无结果");
    expect(statusInfo("unknown", i18n.t).label).toBe("未知");
  });
});
