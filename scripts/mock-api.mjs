// Development mock API for the PT Monitor dashboard.
//
// Replaces the real backend (pnpm cli serve) so the frontend can be developed,
// tested or screenshotted without a Prowlarr DB or live PT-depiler requests.
// The vite dev server proxies /api to 127.0.0.1:9709 (see frontend/vite.config.ts),
// so start this mock and `pnpm ui:dev` and open the dashboard directly.
//
// Usage:
//   node scripts/mock-api.mjs            # listen on 127.0.0.1:9709
//   PORT=9800 node scripts/mock-api.mjs
//
// Endpoints mirror the real backend:
//   GET  /api/sites                     -> current snapshots and discovery diagnostics
//   GET  /api/sites/<definition>/history?hours=N
//   POST /api/collect                   -> triggers a fake collect (returns {})
//
// History values come from a per-site seeded random walk, so the sparklines look
// like real cumulative counters (steady growth punctuated by upload/download
// spikes and jitter) instead of a smooth curve, and the data stays reproducible
// across runs: the same site always draws the same trend and ratio always
// equals uploaded / downloaded.

import { createServer } from "node:http";

const HOST = process.env.HOST ?? "127.0.0.1";
const PORT = Number(process.env.PORT ?? 9709);
const HOUR_MS = 3600 * 1000;
const HISTORY_HOURS = 24 * 7;

// statusName values understood by the frontend statusInfo() helper.
const SITES = [
  { definition: "hdtime", name: "HDTime", status: "success", user: "kfstorm", level: "Star 2", hnrUnsatisfied: 2, hnrPreWarning: 0 },
  { definition: "mteam", name: "MTeam", status: "needLogin", user: null, level: null, hnrUnsatisfied: 0, hnrPreWarning: 0 },
  { definition: "chdbits", name: "CHDBits", status: "success", user: "kfstorm", level: "Bone", hnrUnsatisfied: 0, hnrPreWarning: 0 },
  { definition: "opencd", name: "OpenCD", status: "passParse", user: "kfstorm", level: "Ordinary", hnrUnsatisfied: 0, hnrPreWarning: 3 },
  { definition: "keepfrds", name: "KeepFrds", status: "success", user: "kfstorm", level: "Regular", hnrUnsatisfied: 0, hnrPreWarning: 0 },
  { definition: "dicmusic", name: "DICMusic", status: "parseError", user: null, level: null, hnrUnsatisfied: 0, hnrPreWarning: 0 },
];

const SKIPPED = [
  {
    prowlarrIndexerId: 42,
    prowlarrIndexerName: "Unmapped Site",
    reason: "no-match",
  },
];

// Small deterministic PRNG (mulberry32) so every run draws the same shapes.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(value) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Generate one week of hourly points for a site as a mean-reverting random
// walk: uploaded/downloaded/bonus accumulate with occasional spikes, while
// rate-like metrics (bonusPerHour, seedingCount) track the walk with jitter.
// Increments are additive so cumulative counters grow by plausible amounts and
// the ratio (uploaded / downloaded) meanders in a realistic band instead of
// compounding away.
function seriesFor(site) {
  const rand = mulberry32(hashStr(site.definition));
  let uploaded = 1.5e11 * (0.8 + rand() * 0.6);
  let downloaded = 1e11 * (0.5 + rand() * 0.7);
  let bonus = 5000 + rand() * 6000;
  let seedingBonus = 800 + rand() * 1500;
  let activity = 0.8;
  const points = [];

  for (let i = 0; i < HISTORY_HOURS; i++) {
    activity += (0.8 - activity) * 0.12 + (rand() - 0.5) * 0.22;
    if (rand() < 0.08) activity += 0.4 + rand() * 0.8;
    activity = Math.max(0.15, Math.min(2.5, activity));

    const uploadBurst = activity > 1.5 ? (activity - 1.2) * 3e9 : 0;
    uploaded += (0.5 + activity) * 6e8 * (0.5 + rand() * 0.5) + uploadBurst;
    downloaded += (0.4 + activity * 0.4) * 4e8 * (0.5 + rand() * 0.5);
    bonus += 30 + activity * 60 + rand() * 40;
    seedingBonus += 5 + activity * 12;

    points.push({
      activity,
      uploaded,
      downloaded,
      bonus,
      seedingBonus,
      bonusPerHour: 150 + 400 * activity * (0.85 + rand() * 0.3),
      seedingCount: 90 + 90 * activity,
      seedingSize: 4e9 * (0.6 + 0.8 * activity),
    });
  }
  return points;
}

const SERIES = new Map();
function series(site) {
  let points = SERIES.get(site.definition);
  if (!points) {
    points = seriesFor(site);
    SERIES.set(site.definition, points);
  }
  return points;
}

function snapshot(site, point, collectedAt) {
  const ratio =
    point.downloaded > 0
      ? Math.round((point.uploaded / point.downloaded) * 100) / 100
      : null;
  return {
    definition: site.definition,
    prowlarrIndexerName: site.name,
    collectedAt,
    statusName: site.status,
    uploaded: Math.round(point.uploaded),
    downloaded: Math.round(point.downloaded),
    ratio,
    bonus: Math.round(point.bonus),
    seedingBonus: Math.round(point.seedingBonus),
    bonusPerHour: Math.round(point.bonusPerHour),
    seedingCount: Math.round(point.seedingCount),
    seedingSize: Math.round(point.seedingSize),
    hnrUnsatisfied: site.hnrUnsatisfied,
    hnrPreWarning: site.hnrPreWarning,
    username: site.user,
    level: site.level,
  };
}

const server = createServer((req, res) => {
  res.setHeader("content-type", "application/json");
  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);

  if (req.method === "GET" && url.pathname === "/api/sites") {
    const now = Date.now();
    res.end(
      JSON.stringify({
        sites: SITES.map((site) => {
          const points = series(site);
          return snapshot(site, points[points.length - 1], now);
        }),
        skipped: SKIPPED,
        discovery: {
          status: "ready",
          updatedAt: new Date(now).toISOString(),
        },
      }),
    );
    return;
  }

  const match = url.pathname.match(/^\/api\/sites\/([^/]+)\/history$/);
  if (req.method === "GET" && match) {
    const definition = decodeURIComponent(match[1]);
    const site = SITES.find((entry) => entry.definition === definition);
    const hours = Math.max(1, Math.min(Number(url.searchParams.get("hours") ?? 24), HISTORY_HOURS));
    if (!site) {
      res.end("[]");
      return;
    }
    const points = series(site);
    const slice = points.slice(-hours);
    const now = Date.now();
    res.end(
      JSON.stringify(
        slice.map((point, i) =>
          snapshot(site, point, now - (slice.length - 1 - i) * HOUR_MS),
        ),
      ),
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/collect") {
    res.end(JSON.stringify(SITES.map((site) => ({
      definition: site.definition,
      ok: true,
      statusName: site.status,
    }))));
    return;
  }

  res.statusCode = 404;
  res.end("{}");
});

server.listen(PORT, HOST, () => {
  console.log(`mock api listening on http://${HOST}:${PORT}`);
});
