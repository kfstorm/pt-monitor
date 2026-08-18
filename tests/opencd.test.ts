import assert from "node:assert/strict";
import test from "node:test";

import { htmlToDocument, installDomGlobals } from "../src/dom.ts";
import { createSite } from "../src/ptdepiler.ts";

test("OpenCD user-info collection tolerates jsdom cells without innerText", async () => {
  installDomGlobals();
  const site = await createSite("opencd");
  (site as unknown as { request: (config: unknown) => Promise<unknown> }).request = async (config) => {
    const url = (config as { url?: string }).url;
    const data =
      url === "/index.php"
        ? htmlToDocument('<a href="userdetails.php?id=7">tester</a>')
        : url === "/getusertorrentlistajax.php"
          ? '<table><tr><th>Title</th><th>Type</th><th>Size</th></tr><tr><td>Album</td><td>FLAC</td><td>2 GB</td></tr></table>'
          : htmlToDocument("<html><body></body></html>");
    return {
      data,
      status: 200,
      statusText: "OK",
      headers: {},
      request: { responseURL: "https://open.cd/" },
    };
  };

  const result = await site.getUserInfoResult();

  assert.equal(result.status, 3);
  assert.equal(result.seeding, 1);
  assert.equal(result.seedingSize, 2 * 1024 ** 3);
});
