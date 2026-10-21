import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { htmlToDocument, installDomGlobals } from "../../src/dom.ts";

installDomGlobals();
const require = createRequire(new URL("../../vendor/PT-depiler/package.json", import.meta.url));
const select = require("sizzle") as (selector: string, context: Document) => Element[];
const html = `<html><body><table>${
  '<tr><td><a href="/user?id=1">Example</a></td><td>100</td></tr>'.repeat(300)
}</table></body></html>`;

async function collectGarbage(): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setImmediate(resolve));
    globalThis.gc!();
  }
}

function parseAndQuery(): Document {
  const doc = htmlToDocument(html);
  assert.ok(doc instanceof Document);
  assert.equal(select("table tr:gt(0) td a:contains(Example)", doc).length, 299);
  assert.equal(select("td:has(a)", doc).length, 300);
  return doc;
}

// Warm up module/selector caches before measuring retained documents and heap.
for (let i = 0; i < 4; i++) parseAndQuery();
await collectGarbage();
const baseline = process.memoryUsage().heapUsed;
const documents: WeakRef<Document>[] = [];
for (let batch = 0; batch < 4; batch++) {
  for (let i = 0; i < 10; i++) documents.push(new WeakRef(parseAndQuery()));
  await collectGarbage();
}

console.log(JSON.stringify({
  retainedDocuments: documents.filter((doc) => doc.deref() !== undefined).length,
  heapGrowthBytes: process.memoryUsage().heapUsed - baseline,
}));
