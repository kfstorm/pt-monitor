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
