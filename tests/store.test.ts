import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SnapshotStore } from "../src/store.ts";
import type { AccountSnapshot } from "../src/normalize.ts";

function snapshot(definition: string, at: number, bonus: number): AccountSnapshot {
  return {
    definition,
    prowlarrIndexerId: 1,
    prowlarrIndexerName: definition,
    collectedAt: at,
    status: 3,
    statusName: "success",
    uploaded: 10,
    downloaded: 2,
    ratio: 5,
    bonus,
    bonusPerHour: 1,
    seedingCount: 2,
    seedingSize: 3,
    hnrUnsatisfied: 0,
    hnrPreWarning: 0,
    username: null,
    level: null,
    raw: { site: definition },
  };
}

test("stores latest snapshot and history", () => {
  const dir = mkdtempSync(join(tmpdir(), "pt-monitor-"));
  const store = new SnapshotStore(join(dir, "state.db"));
  try {
    store.insert(snapshot("a", 1000, 10));
    store.insert(snapshot("a", 2000, 20));
    store.insert(snapshot("b", 1500, 30));
    assert.equal(store.latestFor("a")?.bonus, 20);
    assert.deepEqual(store.latest().map((x) => x.definition), ["a", "b"]);
    assert.equal(store.history("a", 0).length, 2);
  } finally {
    store.close();
  }
});
