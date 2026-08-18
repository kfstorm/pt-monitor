import { describe, expect, it } from "vitest";

import { fmtBytes, fmtDay, fmtNum, fmtRatio, fmtTime } from "@/lib/format";

describe("fmtBytes", () => {
  it("formats byte values with binary units", () => {
    expect(fmtBytes(0)).toBe("0.00 B");
    expect(fmtBytes(1023)).toBe("1023 B");
    expect(fmtBytes(1024)).toBe("1.00 KiB");
    expect(fmtBytes(1536)).toBe("1.50 KiB");
    expect(fmtBytes(10 * 1024 * 1024)).toBe("10.0 MiB");
    expect(fmtBytes(100 * 1024 * 1024)).toBe("100 MiB");
    expect(fmtBytes(2 * 1024 ** 4)).toBe("2.00 TiB");
  });

  it("renders an en dash for null", () => {
    expect(fmtBytes(null)).toBe("–");
  });
});

describe("fmtNum", () => {
  it("formats finite numbers with up to two decimals", () => {
    expect(fmtNum(42)).toBe("42");
    expect(fmtNum(42.5)).toBe("42.5");
    expect(fmtNum(42.555)).toBe("42.56");
  });

  it("renders an en dash for null", () => {
    expect(fmtNum(null)).toBe("–");
  });
});

describe("fmtRatio", () => {
  it("renders infinity markers", () => {
    expect(fmtRatio(Infinity, null, null)).toBe("∞");
    expect(fmtRatio(-Infinity, null, null)).toBe("-∞");
  });

  it("derives an infinite ratio from nonzero upload and zero download", () => {
    expect(fmtRatio(null, 512, 0)).toBe("∞");
  });

  it("renders an en dash when the ratio is missing", () => {
    expect(fmtRatio(null, 0, 512)).toBe("–");
    expect(fmtRatio(null, null, null)).toBe("–");
  });

  it("delegates to fmtNum for finite values", () => {
    expect(fmtRatio(2.5, null, null)).toBe("2.5");
  });
});

describe("fmtTime", () => {
  it("formats timestamps and missing values", () => {
    expect(fmtTime(1700000000000)).not.toBe("never");
    expect(fmtTime(null)).toBe("never");
  });
});

describe("fmtDay", () => {
  it("formats a timestamp as local date and time", () => {
    const d = new Date(2024, 0, 15, 9, 5);
    expect(fmtDay(d.getTime())).toBe("1/15 09:05");
  });
});
