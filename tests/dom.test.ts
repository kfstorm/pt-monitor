import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("repeated HTML parsing and Sizzle queries release earlier documents", () => {
  const child = spawnSync(process.execPath, [
    "--expose-gc",
    "--max-old-space-size=256",
    "--import", "tsx",
    fileURLToPath(new URL("./fixtures/dom-memory.ts", import.meta.url)),
  ], { encoding: "utf8", timeout: 30_000 });
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0, child.stderr);
  const result = JSON.parse(child.stdout) as {
    retainedDocuments: number;
    heapGrowthBytes: number;
  };
  // Sizzle may retain its current document, but must release previous ones.
  assert.ok(result.retainedDocuments <= 1, `${result.retainedDocuments} documents retained`);
  assert.ok(result.heapGrowthBytes < 16 * 1024 ** 2, `${result.heapGrowthBytes} bytes retained`);
});
