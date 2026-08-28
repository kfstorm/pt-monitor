import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import test from "node:test";

import { normalizeUserInfo } from "../src/normalize.ts";
import { SnapshotStore } from "../src/store.ts";
import { createDiscoveryRefresher, route } from "../src/server.ts";
import type { DiscoveryResult, SiteTarget } from "../src/collector.ts";

function response(): { value: () => unknown; server: ServerResponse } {
  let body: unknown;
  const server = {
    writeHead() {},
    end(value: string) {
      body = JSON.parse(value);
    },
  } as unknown as ServerResponse;
  return { value: () => body, server };
}

function snapshot(definition: string, id: number) {
  return normalizeUserInfo(
    definition,
    { id, name: definition.toUpperCase() },
    { username: definition, uploaded: 10 },
    1000,
  );
}

function target(definition: string, id: number): SiteTarget {
  return {
    definition,
    prowlarrIndexerId: id,
    prowlarrIndexerName: definition,
    matchReason: "test",
  };
}

test("refreshes discovered targets and keeps the previous result after a failure", async () => {
  const logs: string[] = [];
  let shouldFail = false;
  let discovered: DiscoveryResult = { targets: [target("new-site", 2)], skipped: [] };
  const refresher = createDiscoveryRefresher(
    { targets: [target("old-site", 1)], skipped: [] },
    async () => {
      if (shouldFail) throw new Error("database temporarily unavailable");
      return discovered;
    },
    (message) => logs.push(message),
  );

  await refresher.refresh();
  assert.deepEqual(refresher.current(), discovered);

  shouldFail = true;
  await refresher.refresh();

  assert.deepEqual(refresher.current(), { targets: [target("new-site", 2)], skipped: [] });
  assert.equal(logs.at(-1), "site discovery refresh failed: database temporarily unavailable");
});

test("does not refresh an explicitly configured target list", async () => {
  const refresher = createDiscoveryRefresher({ targets: [target("fixed-site", 1)], skipped: [] });

  await refresher.refresh();

  assert.deepEqual(refresher.current(), { targets: [target("fixed-site", 1)], skipped: [] });
});

test("sites API preserves current snapshots and adds skipped diagnostics", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pt-monitor-server-"));
  const store = new SnapshotStore(join(dir, "state.db"));
  try {
    store.insert(snapshot("current", 1));
    store.insert(snapshot("removed", 2));
    const skipped = [
      { prowlarrIndexerId: 1, prowlarrIndexerName: "No Match", reason: "no-match" as const },
      { prowlarrIndexerId: 2, prowlarrIndexerName: "Ambiguous", reason: "ambiguous" as const, candidates: ["foo", "bar"] },
      { prowlarrIndexerId: 3, prowlarrIndexerName: "Dead", reason: "dead" as const },
    ];
    const output = response();

    await route(
      { method: "GET", url: "/api/sites" } as IncomingMessage,
      output.server,
      store,
      ["current"],
      async () => [],
      new Map(),
      skipped,
    );

    const body = output.value() as { sites: Array<{ definition: string }>; skipped: unknown };
    assert.deepEqual(body.sites.map(({ definition }) => definition), ["current", "removed"]);
    assert.deepEqual(body.skipped, skipped);
    assert.deepEqual(store.history("removed", 0).map(({ definition }) => definition), ["removed"]);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
