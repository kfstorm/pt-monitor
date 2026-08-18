export interface Site {
  definition: string;
  prowlarrIndexerName: string;
  collectedAt: number;
  statusName: string;
  uploaded: number | null;
  downloaded: number | null;
  ratio: number | null;
  bonus: number | null;
  seedingBonus: number | null;
  bonusPerHour: number | null;
  seedingCount: number | null;
  seedingSize: number | null;
  hnrUnsatisfied: number | null;
  hnrPreWarning: number | null;
  username: string | null;
  level: string | null;
}