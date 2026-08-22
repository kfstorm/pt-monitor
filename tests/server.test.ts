import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import test from "node:test";

import { normalizeUserInfo } from "../src/normalize.ts";
import { SnapshotStore } from "../src/store.ts";
import { route } from "../src/server.ts";

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
