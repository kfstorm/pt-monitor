import assert from "node:assert/strict";
import test from "node:test";

import { resolveSiteUrl } from "../src/site-url.ts";

test("prefers a valid Prowlarr base URL and preserves it exactly", () => {
  assert.equal(
    resolveSiteUrl(
      { baseUrl: "https://configured.example/pt?source=monitor#home" },
      { urls: ["https://metadata.example/"] },
    ),
    "https://configured.example/pt?source=monitor#home",
  );
});

test("falls back to the first valid metadata URL", () => {
  assert.equal(
    resolveSiteUrl(
      { baseUrl: "javascript:alert(1)" },
      {
        urls: ["not-a-url", "ftp://metadata.example/"],
        legacyUrls: ["https://legacy.example/first", "https://legacy.example/second"],
      },
    ),
    "https://legacy.example/first",
  );
});

test("decodes protected metadata URLs before validating them", () => {
  assert.equal(
    resolveSiteUrl({}, { urls: ["uggcf://zrgnqngn.rknzcyr/cg"] }),
    "https://metadata.example/pt",
  );
});

test("returns undefined when no safe URL is available", () => {
  assert.equal(
    resolveSiteUrl(
      { baseUrl: "ftp://configured.example/" },
      { urls: ["javascript:alert(1)"], legacyUrls: ["//metadata.example/"] },
    ),
    undefined,
  );
});
