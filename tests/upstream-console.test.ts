import assert from "node:assert/strict";
import test from "node:test";

import { withUpstreamConsole } from "../src/upstream-console.ts";

test("redacts credential values from upstream debug output", async () => {
  const output: string[] = [];
  const originalWrite = process.stderr.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    output.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;

  try {
    await withUpstreamConsole(true, async () => {
      console.log({
        inputSetting: { token: "test-token", password: "test-password" },
        headers: { Cookie: "session=test-cookie", "X-Api-Key": "test-api-key" },
        message: "safe diagnostic",
      });
    });
  } finally {
    process.stderr.write = originalWrite;
  }

  const rendered = output.join("");
  assert.match(rendered, /safe diagnostic/);
  assert.match(rendered, /\[REDACTED\]/);
  assert.doesNotMatch(rendered, /test-token|test-password|test-cookie|test-api-key/);
});
