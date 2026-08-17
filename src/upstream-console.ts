import { formatWithOptions } from "node:util";

/**
 * PT-depiler writes verbose diagnostics with console.log(), which pollutes the
 * CLI's machine-readable stdout. Keep stdout reserved for JSON. In --debug
 * mode, forward upstream log/info/debug/error output to stderr instead.
 */
export async function withUpstreamConsole<T>(debug: boolean, fn: () => Promise<T>): Promise<T> {
  const original = {
    log: console.log,
    info: console.info,
    debug: console.debug,
    error: console.error,
  };

  const sink = (...args: unknown[]): void => {
    if (!debug) return;
    const rendered = formatWithOptions(
      { colors: false, depth: 8, maxArrayLength: 100, breakLength: 120 },
      ...args,
    );
    process.stderr.write(`[pt-depiler] ${rendered}\n`);
  };

  console.log = sink;
  console.info = sink;
  console.debug = sink;
  console.error = sink;

  try {
    return await fn();
  } finally {
    console.log = original.log;
    console.info = original.info;
    console.debug = original.debug;
    console.error = original.error;
  }
}
