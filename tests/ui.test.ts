import assert from "node:assert/strict";
import { Script } from "node:vm";
import test from "node:test";

import { dashboardHtml } from "../src/ui.ts";

test("dashboard HTML contains a syntactically valid browser script", () => {
  const script = dashboardHtml.match(/<script>([\s\S]*)<\/script>/)?.[1];

  assert.ok(script);
  assert.match(script, /METRICS\s*=\s*\{/);
  assert.match(script, /function niceTicks/);
  assert.match(script, /function drawChart/);
  assert.match(script, /function renderCharts/);
  assert.match(script, /localStorage\.getItem\('pt-monitor\.metric'\)/);
  assert.match(script, /fmtRatio\(s\.ratio,s\.uploaded,s\.downloaded\)/);
  assert.match(script, /s\.seedingBonus/);
  assert.match(script, /Seeding: /);
  assert.doesNotThrow(() => new Script(script));
});

test("dashboard exposes a metric selector with chart containers", () => {
  const metrics = [
    "bonusPerHour",
    "bonus",
    "ratio",
    "uploaded",
    "downloaded",
    "seedingCount",
    "seedingSize",
    "seedingBonus",
    "hnrUnsatisfied",
    "hnrPreWarning",
  ];
  for (const metric of metrics) {
    assert.match(dashboardHtml, new RegExp(`<option value="${metric}"`));
  }
  assert.match(dashboardHtml, /<select id="metric"/);
  assert.match(dashboardHtml, /<div class="chart" data-def="/);
});
