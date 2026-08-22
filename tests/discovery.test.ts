import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { discoverSiteTargets, findIndexerForDefinition } from "../src/collector.ts";
import { mapInputSettings } from "../src/ptdepiler.ts";

function createProwlarrFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), "pt-monitor-discovery-"));
  mkdirSync(join(dir, "Definitions"));
  writeFileSync(join(dir, "Definitions", "lemonhd-net.yml"), "id: lemonhd-net\ntype: private\n");
  writeFileSync(join(dir, "Definitions", "opencd.yml"), "id: opencd\ntype: public\n");

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
  insert.run(100, "Manual Site", "CustomImplementation", "CustomSettings", 1, JSON.stringify({ definitionFile: "manual-definition" }));
  insert.run(101, "OpenCD", "CustomImplementation", "CustomSettings", 1, JSON.stringify({ definitionFile: "opencd" }));
  db.close();
  return dir;
}

test("discovers normalized and custom Prowlarr indexers without site-specific mappings", async () => {
  const dir = createProwlarrFixture();
  try {
    const logs: string[] = [];
    const targets = await discoverSiteTargets(join(dir, "prowlarr.db"), { log: (message) => logs.push(message) });

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

test("resolves an indexer by its discovered definition binding", async () => {
  const dir = createProwlarrFixture();
  try {
    const indexer = await findIndexerForDefinition(join(dir, "prowlarr.db"), "mteam");
    assert.equal(indexer.id, 28);
    assert.equal(indexer.name, "M-Team - TP");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("falls back to the configured definition when discovery has no match", async () => {
  const dir = createProwlarrFixture();
  try {
    const indexer = await findIndexerForDefinition(join(dir, "prowlarr.db"), "manual-definition");
    assert.equal(indexer.id, 100);
    assert.equal(indexer.name, "Manual Site");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("forwards discovery diagnostics when requested", async () => {
  const dir = createProwlarrFixture();
  try {
    const logs: string[] = [];
    await findIndexerForDefinition(
      join(dir, "prowlarr.db"),
      "manual-definition",
      undefined,
      (message) => logs.push(message),
    );
    assert.ok(logs.some((message) => message.includes("skip indexer 100:Manual Site")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("keeps explicit site resolution working when discovery excludes the indexer", async () => {
  const dir = createProwlarrFixture();
  try {
    const indexer = await findIndexerForDefinition(join(dir, "prowlarr.db"), "opencd");
    assert.equal(indexer.id, 101);
    assert.equal(indexer.name, "OpenCD");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("keeps the configured fallback when discovery returns multiple targets", async () => {
  const dir = createProwlarrFixture();
  try {
    const db = new DatabaseSync(join(dir, "prowlarr.db"));
    db.prepare(
      "INSERT INTO Indexers(Id, Name, Implementation, ConfigContract, Enable, Settings) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(
      102,
      "M-Team Alias",
      "CustomImplementation",
      "CustomSettings",
      1,
      JSON.stringify({ definitionFile: "mteam", baseUrl: "https://kp.m-team.cc/" }),
    );
    db.close();

    const indexer = await findIndexerForDefinition(join(dir, "prowlarr.db"), "mteam");
    assert.equal(indexer.id, 102);
    assert.equal(indexer.name, "M-Team Alias");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
