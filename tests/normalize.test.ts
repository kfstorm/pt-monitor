import test from "node:test";
import assert from "node:assert/strict";
import { normalizeUserInfo } from "../src/normalize.ts";

test("normalizes common PT-depiler user info", () => {
  const s = normalizeUserInfo("hdtime", { id: 1, name: "HDTime" }, {
    status: 3,
    uploaded: 1000,
    downloaded: 250,
    bonus: 123.5,
    bonusPerHour: 6.2,
    seeding: 42,
    seedingSize: 9999,
    hnrUnsatisfied: 1,
  }, 1234);
  assert.equal(s.statusName, "success");
  assert.equal(s.ratio, 4);
  assert.equal(s.bonusPerHour, 6.2);
  assert.equal(s.seedingCount, 42);
  assert.equal(s.collectedAt, 1234);
});

test("uses the ordinary PT-depiler display fields", () => {
  const s = normalizeUserInfo("hdtime", { id: 1, name: "HDTime" }, {
    uploaded: 7.78 * 1024 ** 4,
    downloaded: 2.8 * 1024 ** 4,
    ratio: 2.7789,
    trueUploaded: 1.2 * 1024 ** 4,
    trueDownloaded: 2.55 * 1024 ** 4,
    trueRatio: 0.47123,
    bonus: 123.5,
    seedingBonus: 456.7,
  });

  assert.equal(s.uploaded, 7.78 * 1024 ** 4);
  assert.equal(s.downloaded, 2.8 * 1024 ** 4);
  assert.equal(s.ratio, 2.7789);
  assert.equal(s.bonus, 123.5);
  assert.equal(s.seedingBonus, 456.7);
});

test("derives an infinite ordinary ratio when there are no downloads", () => {
  const s = normalizeUserInfo("longpt", { id: 1, name: "LongPT" }, {
    uploaded: 65.86 * 1024 ** 3,
    downloaded: 0,
  });

  assert.equal(s.ratio, Infinity);
});
