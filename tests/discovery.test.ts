import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { discoverSiteResult, discoverSiteTargets } from "../src/collector.ts";
import { mapInputSettings } from "../src/ptdepiler.ts";

function createProwlarrFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), "pt-monitor-discovery-"));
  mkdirSync(join(dir, "Definitions"));
  writeFileSync(join(dir, "Definitions", "lemonhd-net.yml"), "id: lemonhd-net\ntype: private\n");

  const db = new DatabaseSync(join(dir, "prowlarr.db"));
  db.exec(`
    CREATE TABLE Indexers (
      Id INTEGER PRIMARY KEY,
      Name TEXT,
      Implementation TEXT,
      ConfigContract TEXT,
      Enable INTEGER,
      Settings TEXT
    );
    CREATE TABLE IndexerStatus (
      ProviderId INTEGER,
      Cookies TEXT,
      CookiesExpirationDate TEXT
    );
  `);
  const insert = db.prepare(
    "INSERT INTO Indexers(Id, Name, Implementation, ConfigContract, Enable, Settings) VALUES (?, ?, ?, ?, ?, ?)",
  );
  insert.run(27, "LemonHD.net", "Cardigann", "CardigannSettings", 1, JSON.stringify({ definitionFile: "lemonhd-net" }));
  insert.run(28, "M-Team - TP", "MTeamTp", "MTeamTpSettings", 1, JSON.stringify({ apiKey: "test-api-key", baseUrl: "https://kp.m-team.cc/" }));
  insert.run(23, "DICMusic", "DICMusic", "DICMusicSettings", 1, JSON.stringify({ baseUrl: "https://dicmusic.com/" }));
  insert.run(99, "Unmapped Site", "CustomImplementation", "CustomSettings", 1, JSON.stringify({ baseUrl: "https://unmapped.example/" }));
  db.close();
  return dir;
}

test("discovers normalized and custom Prowlarr indexers without site-specific mappings", async () => {
  const dir = createProwlarrFixture();
  try {
    const logs: string[] = [];
    const targets = await discoverSiteTargets(join(dir, "prowlarr.db"), { log: (message) => logs.push(message) });
    const result = await discoverSiteResult(join(dir, "prowlarr.db"));

    assert.deepEqual(
      targets.map(({ definition, prowlarrIndexerId }) => ({ definition, prowlarrIndexerId })),
      [
        { definition: "dicmusic", prowlarrIndexerId: 23 },
        { definition: "lemonhdnet", prowlarrIndexerId: 27 },
        { definition: "mteam", prowlarrIndexerId: 28 },
      ],
    );
    assert.equal(logs.filter((message) => message.includes("matched indexer")).length, 3);
    assert.equal(logs.filter((message) => message.includes("skip indexer 99:Unmapped Site")).length, 1);
    assert.ok(logs.every((message) => !message.includes("test-api-key")));
    assert.deepEqual(result.skipped, [
      {
        prowlarrIndexerId: 99,
        prowlarrIndexerName: "Unmapped Site",
        reason: "no-match",
      },
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("maps generic API key credentials to a declared PT-depiler token input", () => {
  const inputSetting = mapInputSettings(
    { userInputSettingMeta: [{ name: "token", required: true }, { name: "username", required: false }] },
    { apiKey: "test-api-key", username: "test-user" },
  );

  assert.deepEqual(inputSetting, { token: "test-api-key", username: "test-user" });
});
