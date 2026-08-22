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

test("does not expose credentials embedded in a URL", () => {
  assert.equal(
    resolveSiteUrl(
      { baseUrl: "https://user:password@configured.example/" },
      { urls: ["https://metadata.example/"] },
    ),
    "https://metadata.example/",
  );
});

test("falls back when a URL query contains credential material", () => {
  assert.equal(
    resolveSiteUrl(
      { baseUrl: "https://configured.example/?token=secret" },
      { urls: ["https://metadata.example/"] },
    ),
    "https://metadata.example/",
  );
});

test("falls back when a URL fragment contains credential material", () => {
  assert.equal(
    resolveSiteUrl(
      { baseUrl: "https://configured.example/#state=ok&%74oken=secret" },
      { urls: ["https://metadata.example/"] },
    ),
    "https://metadata.example/",
  );
});

test("filters common credential parameter aliases", () => {
  assert.equal(
    resolveSiteUrl(
      { baseUrl: "https://configured.example/?refresh_token=secret&client_secret=secret" },
      { urls: ["https://metadata.example/"] },
    ),
    "https://metadata.example/",
  );
  assert.equal(
    resolveSiteUrl(
      { baseUrl: "https://configured.example/#bearer=secret&jwt=secret" },
      { urls: ["https://metadata.example/"] },
    ),
    "https://metadata.example/",
  );
});
