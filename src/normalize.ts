import { statusName } from "./status.ts";

export interface AccountSnapshot {
  definition: string;
  prowlarrIndexerId: number;
  prowlarrIndexerName: string;
  collectedAt: number;
  status: number | null;
  statusName: string;
  uploaded: number | null;
  downloaded: number | null;
  ratio: number | null;
  bonus: number | null;
  bonusPerHour: number | null;
  seedingCount: number | null;
  seedingSize: number | null;
  hnrUnsatisfied: number | null;
  hnrPreWarning: number | null;
  username: string | null;
  level: string | null;
  raw: Record<string, unknown>;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeUserInfo(
  definition: string,
  indexer: { id: number; name: string },
  result: Record<string, unknown>,
  collectedAt = Date.now(),
): AccountSnapshot {
  const status = finiteNumber(result.status);
  const uploaded = finiteNumber(result.trueUploaded) ?? finiteNumber(result.uploaded);
  const downloaded = finiteNumber(result.trueDownloaded) ?? finiteNumber(result.downloaded);
  const explicitRatio = finiteNumber(result.trueRatio) ?? finiteNumber(result.ratio);
  const computedRatio = uploaded !== null && downloaded !== null && downloaded > 0 ? uploaded / downloaded : null;

  return {
    definition,
    prowlarrIndexerId: indexer.id,
    prowlarrIndexerName: indexer.name,
    collectedAt,
    status,
    statusName: statusName(status),
    uploaded,
    downloaded,
    ratio: explicitRatio ?? computedRatio,
    bonus: finiteNumber(result.bonus) ?? finiteNumber(result.seedingBonus),
    bonusPerHour: finiteNumber(result.bonusPerHour) ?? finiteNumber(result.seedingBonusPerHour),
    seedingCount: finiteNumber(result.seeding),
    seedingSize: finiteNumber(result.seedingSize),
    hnrUnsatisfied: finiteNumber(result.hnrUnsatisfied),
    hnrPreWarning: finiteNumber(result.hnrPreWarning),
    username: stringValue(result.username) ?? stringValue(result.name),
    level: stringValue(result.levelName),
    raw: result,
  };
}

export const _test = { finiteNumber, stringValue };
