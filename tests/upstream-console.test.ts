import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeErrorMessage, withUpstreamConsole } from "../src/upstream-console.ts";

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

test("redacts credential values embedded in diagnostic strings", () => {
  const rendered = sanitizeErrorMessage(
    "Request failed: Cookie: session=string-secret; cf_clearance=string-secret-2 Authorization: Bearer string-token accessToken=access-secret authToken=auth-secret refresh_token=refresh-secret client_secret=client-secret",
  );
  assert.doesNotMatch(rendered, /string-secret|string-token|access-secret|auth-secret|refresh-secret|client-secret/);
  assert.match(rendered, /\[redacted\]/);
});
