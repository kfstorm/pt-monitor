import { JSDOM } from "jsdom";

const realm = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://localhost/",
});

const parser = new realm.window.DOMParser();

export function installDomGlobals(): void {
  const window = realm.window;
  const globals = globalThis as Record<string, unknown>;

  globals.window = window;
  globals.document = window.document;
  // Node 21+ exposes `globalThis.navigator` as a read-only accessor.
  // Do not overwrite it; PT-depiler's site core only needs a navigator when
  // the host does not already provide one.
  if (!("navigator" in globalThis)) {
    Object.defineProperty(globalThis, "navigator", {
      value: window.navigator,
      configurable: true,
      writable: true,
    });
  }

  for (const name of [
    "Document",
    "DocumentFragment",
    "Node",
    "Element",
    "HTMLElement",
    "HTMLAnchorElement",
    "HTMLImageElement",
    "HTMLSpanElement",
    "HTMLTableElement",
    "HTMLTableRowElement",
    "HTMLTableCellElement",
    "DOMParser",
    "CustomEvent",
    "Event",
  ]) {
    const value = (window as unknown as Record<string, unknown>)[name];
    if (value) globals[name] = value;
  }
}

export function htmlToDocument(html: string): Document {
  return parser.parseFromString(html, "text/html");
}
