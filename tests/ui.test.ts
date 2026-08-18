import assert from "node:assert/strict";
import { Script } from "node:vm";
import test from "node:test";

import { dashboardHtml } from "../src/ui.ts";

test("dashboard HTML contains a syntactically valid browser script", () => {
  const script = dashboardHtml.match(/<script>([\s\S]*)<\/script>/)?.[1];

  assert.ok(script);
  assert.match(script, /=>`\$\{/);
  assert.match(script, /points="\$\{points\}"/);
  assert.doesNotThrow(() => new Script(script));
});
