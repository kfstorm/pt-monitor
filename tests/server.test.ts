import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import test from "node:test";

import { normalizeUserInfo } from "../src/normalize.ts";
import { SnapshotStore } from "../src/store.ts";
import { route, type DiscoveryState } from "../src/server.ts";

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

async function getSites(store: SnapshotStore, state: DiscoveryState): Promise<unknown> {
  const output = response();
  await route(
    { method: "GET", url: "/api/sites" } as IncomingMessage,
    output.server,
    store,
    () => state,
    async () => [],
  );
  return output.value();
}

function snapshot(definition: string, id: number) {
  return normalizeUserInfo(
    definition,
    { id, name: definition.toUpperCase() },
    { username: definition, uploaded: 10 },
    1000,
  );
}

test("aggregated sites response filters snapshots by current targets", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pt-monitor-server-"));
  const store = new SnapshotStore(join(dir, "state.db"));
  try {
    store.insert(snapshot("current", 1));
    store.insert(snapshot("removed", 2));
    const state: DiscoveryState = {
      targets: [{ definition: "current", prowlarrIndexerId: 1, prowlarrIndexerName: "Current", matchReason: "test" }],
      skipped: [{ prowlarrIndexerId: 3, prowlarrIndexerName: "Missing", reason: "no-match" }],
      discovery: { status: "ready", updatedAt: "2026-08-22T12:00:00.000Z" },
    };

    assert.deepEqual(await getSites(store, state), {
      sites: [
        {
          id: 1,
          definition: "current",
          prowlarrIndexerId: 1,
          prowlarrIndexerName: "CURRENT",
          collectedAt: 1000,
          status: null,
          statusName: "unknown",
          uploaded: 10,
          downloaded: null,
          ratio: null,
          bonus: null,
          seedingBonus: null,
          bonusPerHour: null,
          seedingCount: null,
          seedingSize: null,
          hnrUnsatisfied: null,
          hnrPreWarning: null,
          username: "current",
          level: null,
        },
      ],
      skipped: state.skipped,
      discovery: state.discovery,
    });
    assert.deepEqual(store.history("removed", 0).map(({ definition }) => definition), ["removed"]);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("aggregated sites response preserves discovery error and disabled states", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pt-monitor-server-"));
  const store = new SnapshotStore(join(dir, "state.db"));
  try {
    const skipped = [{ prowlarrIndexerId: 3, prowlarrIndexerName: "Missing", reason: "no-match" as const }];
    const errorState: DiscoveryState = {
      targets: [],
      skipped,
      discovery: {
        status: "error",
        updatedAt: "2026-08-22T12:00:00.000Z",
        error: { code: "discovery-failed", detail: "database unavailable" },
      },
    };
    const disabledState: DiscoveryState = {
      targets: [{ definition: "manual", prowlarrIndexerId: 0, prowlarrIndexerName: "", matchReason: "explicit configuration" }],
      skipped: [],
      discovery: { status: "disabled", updatedAt: null },
    };

    assert.deepEqual((await getSites(store, errorState)), {
      sites: [],
      skipped,
      discovery: errorState.discovery,
    });
    assert.deepEqual((await getSites(store, disabledState)), {
      sites: [],
      skipped: [],
      discovery: { status: "disabled", updatedAt: null },
    });
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
