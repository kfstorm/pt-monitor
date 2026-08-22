import { DatabaseSync } from "node:sqlite";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";

import type { AccountSnapshot } from "./normalize.ts";

export interface StoredSnapshot extends Omit<AccountSnapshot, "raw"> {
  id: number;
  raw: Record<string, unknown>;
}

export class SnapshotStore {
  readonly path: string;
  private readonly db: DatabaseSync;

  constructor(path: string) {
    this.path = resolve(path);
    mkdirSync(dirname(this.path), { recursive: true });
    this.db = new DatabaseSync(this.path);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        definition TEXT NOT NULL,
        prowlarr_indexer_id INTEGER NOT NULL,
        prowlarr_indexer_name TEXT NOT NULL,
        collected_at INTEGER NOT NULL,
        status INTEGER,
        status_name TEXT NOT NULL,
        uploaded REAL,
        downloaded REAL,
        ratio REAL,
        bonus REAL,
        bonus_per_hour REAL,
        seeding_count REAL,
        seeding_size REAL,
        hnr_unsatisfied REAL,
        hnr_pre_warning REAL,
        username TEXT,
        level TEXT,
        raw_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_snapshots_definition_time
        ON snapshots(definition, collected_at DESC);
    `);
  }

  close(): void {
    this.db.close();
  }

  insert(snapshot: AccountSnapshot): number {
    const raw = { ...snapshot.raw, seedingBonus: snapshot.seedingBonus };
    const result = this.db.prepare(`
      INSERT INTO snapshots (
        definition, prowlarr_indexer_id, prowlarr_indexer_name, collected_at,
        status, status_name, uploaded, downloaded, ratio, bonus, bonus_per_hour,
        seeding_count, seeding_size, hnr_unsatisfied, hnr_pre_warning,
        username, level, raw_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      snapshot.definition,
      snapshot.prowlarrIndexerId,
      snapshot.prowlarrIndexerName,
      snapshot.collectedAt,
      snapshot.status,
      snapshot.statusName,
      snapshot.uploaded,
      snapshot.downloaded,
      snapshot.ratio,
      snapshot.bonus,
      snapshot.bonusPerHour,
      snapshot.seedingCount,
      snapshot.seedingSize,
      snapshot.hnrUnsatisfied,
      snapshot.hnrPreWarning,
      snapshot.username,
      snapshot.level,
      JSON.stringify(raw),
    );
    return Number(result.lastInsertRowid);
  }

  latest(): StoredSnapshot[] {
    const rows = this.db.prepare(`
      SELECT s.*
      FROM snapshots s
      WHERE s.id = (
        SELECT s2.id FROM snapshots s2
        WHERE s2.definition = s.definition
        ORDER BY s2.collected_at DESC, s2.id DESC
        LIMIT 1
      )
      ORDER BY s.definition COLLATE NOCASE
    `).all() as Array<Record<string, unknown>>;
    return rows.map(rowToSnapshot);
  }

  latestFor(definition: string, prowlarrIndexerId?: number): StoredSnapshot | null {
    const indexerClause = prowlarrIndexerId === undefined ? "" : " AND prowlarr_indexer_id = ?";
    const params = prowlarrIndexerId === undefined ? [definition] : [definition, prowlarrIndexerId];
    const row = this.db.prepare(`
      SELECT * FROM snapshots
      WHERE definition = ?${indexerClause}
      ORDER BY collected_at DESC, id DESC
      LIMIT 1
    `).get(...params) as Record<string, unknown> | undefined;
    return row ? rowToSnapshot(row) : null;
  }

  history(definition: string, since: number, limit = 2000, prowlarrIndexerId?: number): StoredSnapshot[] {
    const indexerClause = prowlarrIndexerId === undefined ? "" : " AND prowlarr_indexer_id = ?";
    const params = prowlarrIndexerId === undefined
      ? [definition, since, limit]
      : [definition, since, prowlarrIndexerId, limit];
    const rows = this.db.prepare(`
      SELECT * FROM snapshots
      WHERE definition = ? AND collected_at >= ?${indexerClause}
      ORDER BY collected_at ASC, id ASC
      LIMIT ?
    `).all(...params) as Array<Record<string, unknown>>;
    return rows.map(rowToSnapshot);
  }
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function rowToSnapshot(row: Record<string, unknown>): StoredSnapshot {
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(String(row.raw_json ?? "{}")) as Record<string, unknown>;
  } catch {}

  return {
    id: Number(row.id),
    definition: String(row.definition),
    prowlarrIndexerId: Number(row.prowlarr_indexer_id),
    prowlarrIndexerName: String(row.prowlarr_indexer_name),
    collectedAt: Number(row.collected_at),
    status: nullableNumber(row.status),
    statusName: String(row.status_name),
    uploaded: nullableNumber(row.uploaded),
    downloaded: nullableNumber(row.downloaded),
    ratio: nullableNumber(row.ratio),
    bonus: nullableNumber(row.bonus),
    seedingBonus: nullableNumber(raw.seedingBonus),
    bonusPerHour: nullableNumber(row.bonus_per_hour),
    seedingCount: nullableNumber(row.seeding_count),
    seedingSize: nullableNumber(row.seeding_size),
    hnrUnsatisfied: nullableNumber(row.hnr_unsatisfied),
    hnrPreWarning: nullableNumber(row.hnr_pre_warning),
    username: row.username == null ? null : String(row.username),
    level: row.level == null ? null : String(row.level),
    raw,
  };
}
