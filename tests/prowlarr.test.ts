import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { ProwlarrDB, _test } from "../src/prowlarr.ts";

test("merges configured cookie with runtime cookie and resolves Cardigann privacy from Definitions", () => {
  const dir = mkdtempSync(join(tmpdir(), "pt-monitor-"));
  try {
    const definitions = join(dir, "Definitions");
    mkdirSync(definitions);
    writeFileSync(join(definitions, "pter.yml"), "---\nid: pter\nname: PTer\ntype: private\nsettings:\n  - name: cookie\n    type: text\n");

    const path = join(dir, "prowlarr.db");
    const db = new DatabaseSync(path);
    db.exec(`
      CREATE TABLE Indexers (Id INTEGER PRIMARY KEY, Name TEXT, Implementation TEXT, ConfigContract TEXT, Enable INTEGER, Settings TEXT);
      CREATE TABLE IndexerStatus (ProviderId INTEGER, Cookies TEXT, CookiesExpirationDate TEXT);
    `);
    db.prepare("INSERT INTO Indexers(Id, Name, Enable, Settings) VALUES (?, ?, ?, ?)").run(
      7,
      "PTer",
      1,
      JSON.stringify({ definitionFile: "pter", cookie: "uid=abc; pass=old" }),
    );
    db.prepare("INSERT INTO IndexerStatus(ProviderId, Cookies, CookiesExpirationDate) VALUES (?, ?, ?)").run(
      7,
      JSON.stringify({ pass: "new", cf_clearance: "cf123" }),
      "2026-09-01T00:00:00Z",
    );
    db.close();

    const row = new ProwlarrDB(path).getIndexer("PTer");
    assert.equal(row.enabled, true);
    assert.equal(row.privacy, "private");
    assert.equal(row.privacySource, "cardigann-definition");
    assert.equal(row.definitionFile, "pter");
    assert.deepEqual(row.cookies, { uid: "abc", pass: "new", cf_clearance: "cf123" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolves public definitions and leaves missing definitions unknown", () => {
  const dir = mkdtempSync(join(tmpdir(), "pt-monitor-"));
  try {
    const definitions = join(dir, "Definitions", "Custom");
    mkdirSync(definitions, { recursive: true });
    writeFileSync(join(definitions, "public-test.yml"), "id: public-test\nname: Public Test\ntype: public\n");

    const path = join(dir, "prowlarr.db");
    const db = new DatabaseSync(path);
    db.exec(`
      CREATE TABLE Indexers (Id INTEGER PRIMARY KEY, Name TEXT, Implementation TEXT, ConfigContract TEXT, Enable INTEGER, Settings TEXT);
      CREATE TABLE IndexerStatus (ProviderId INTEGER, Cookies TEXT, CookiesExpirationDate TEXT);
    `);
    db.prepare("INSERT INTO Indexers(Id, Name, Enable, Settings) VALUES (?, ?, ?, ?)").run(
      1,
      "Public Test",
      1,
      JSON.stringify({ definitionFile: "public-test" }),
    );
    db.prepare("INSERT INTO Indexers(Id, Name, Enable, Settings) VALUES (?, ?, ?, ?)").run(
      2,
      "Unknown",
      0,
      JSON.stringify({ definitionFile: "not-cached" }),
    );
    db.close();

    const rows = new ProwlarrDB(path).listIndexers();
    assert.equal(rows[0].privacy, "public");
    assert.equal(rows[0].privacySource, "cardigann-definition");
    assert.equal(rows[1].privacy, "unknown");
    assert.equal(rows[1].privacySource, "unknown");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("root-level YAML type is used instead of nested setting type", () => {
  assert.equal(
    _test.privacyFromDefinitionText("id: x\ntype: private\nsettings:\n  - name: cookie\n    type: text\n"),
    "private",
  );
});
