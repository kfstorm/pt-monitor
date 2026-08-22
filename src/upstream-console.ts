import { formatWithOptions } from "node:util";

const sensitiveKey = /cookie|password|passkey|token|api[-_]?key|secret|authorization/i;
const credentialNamePattern = String.raw`(?:api[-_]?key|[a-z0-9_-]*(?:token|secret|password|passkey|cookie|authorization)[a-z0-9_-]*)`;

export function sanitizeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(new RegExp(String.raw`([?&]${credentialNamePattern}=)[^&\s]*`, "gi"), "$1[redacted]")
    .replace(/\b(?:cookie|set-cookie)\s*[:=]\s*[^\r\n]*/gi, "cookie=[redacted]")
    .replace(new RegExp(String.raw`(["']${credentialNamePattern}["']\s*:\s*)"[^"]*"`, "gi"), '$1"[redacted]"')
    .replace(new RegExp(String.raw`\b(${credentialNamePattern})\s*[:=]\s*(?:bearer\s+)?(?:"[^"]*"|'[^']*'|[^\s,;}]+)`, "gi"), "$1=[redacted]")
    .replace(/(https?:\/\/[^/\s:@]+:)[^@\s]+@/gi, "$1[redacted]@");
}

function sanitizeForLog(value: unknown, key?: string): unknown {
  if (key && sensitiveKey.test(key)) return "[REDACTED]";
  if (typeof value === "string") return sanitizeErrorMessage(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeForLog(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeForLog(entryValue, entryKey),
      ]),
    );
  }
  return value;
}

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
      ...args.map((arg) => sanitizeForLog(arg)),
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
