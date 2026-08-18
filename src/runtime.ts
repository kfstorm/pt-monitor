import type { FlareSolverrResult, RuntimeOptions } from "./types.ts";
import { htmlToDocument } from "./dom.ts";

interface SolverCookie {
  name?: string;
  value?: string;
  domain?: string;
  path?: string;
}

function parseCookieHeader(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const pos = part.indexOf("=");
    if (pos <= 0) continue;
    out[part.slice(0, pos).trim()] = part.slice(pos + 1).trim();
  }
  return out;
}

export class NodeRuntime {
  private readonly baseCookies: Record<string, string>;
  private readonly transientCookies = new Map<string, string>();
  private readonly userAgentByHost = new Map<string, string>();
  private readonly options: RuntimeOptions;

  constructor(options: RuntimeOptions, cookies: Record<string, string>) {
    this.options = options;
    this.baseCookies = { ...cookies };
  }

  toDocument(html: string): Document {
    return htmlToDocument(html);
  }

  getRequestHeaders(url: string): Record<string, string> {
    const host = new URL(url).host;
    const cookies = { ...this.baseCookies, ...Object.fromEntries(this.transientCookies) };
    const headers: Record<string, string> = {};

    if (Object.keys(cookies).length > 0) {
      headers.Cookie = Object.entries(cookies)
        .map(([name, value]) => `${name}=${value}`)
        .join("; ");
    }

    headers["User-Agent"] =
      this.userAgentByHost.get(host) ?? this.options.http?.userAgent ?? "pt-monitor/0.3";
    return headers;
  }

  async flaresolverrFetch(url: string): Promise<FlareSolverrResult> {
    const fs = this.options.flaresolverr;
    if (!fs?.enabled) {
      throw new Error(`Cloudflare challenge detected for ${url}, but FlareSolverr is disabled`);
    }

    const endpoint = fs.url ?? "http://127.0.0.1:8191/v1";
    const timeoutMs = fs.timeoutMs ?? 90_000;
    const cookieHeader = this.getRequestHeaders(url).Cookie ?? "";
    const cookies = Object.entries(parseCookieHeader(cookieHeader)).map(([name, value]) => ({ name, value }));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs + 10_000);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cmd: "request.get",
          url,
          maxTimeout: timeoutMs,
          cookies,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`FlareSolverr HTTP ${response.status}`);
      }

      const payload = (await response.json()) as Record<string, any>;
      if (payload.status !== "ok") {
        throw new Error(`FlareSolverr failed: ${payload.message ?? "unknown error"}`);
      }

      const solution = payload.solution ?? {};
      const html = solution.response;
      if (typeof html !== "string") throw new Error("FlareSolverr returned no HTML response");

      const targetStatus = Number(solution.status ?? 200);
      if (targetStatus >= 400) {
        throw new Error(`FlareSolverr target returned HTTP ${targetStatus}`);
      }

      for (const cookie of (solution.cookies ?? []) as SolverCookie[]) {
        if (cookie.name && cookie.value !== undefined) {
          this.transientCookies.set(cookie.name, cookie.value);
        }
      }

      const finalUrl = String(solution.url ?? url);
      const host = new URL(finalUrl).host;
      if (solution.userAgent) this.userAgentByHost.set(host, String(solution.userAgent));

      return {
        html,
        status: targetStatus,
        url: finalUrl,
        headers: {},
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async getCookie(detail: { url?: string; name?: string }): Promise<Record<string, unknown> | null> {
    if (!detail.name) return null;
    const url = detail.url ?? "http://localhost/";
    const value = parseCookieHeader(this.getRequestHeaders(url).Cookie ?? "")[detail.name];
    if (value === undefined) return null;
    return { name: detail.name, value };
  }
}

export function installRuntime(runtime: NodeRuntime): void {
  (globalThis as Record<string, unknown>).__PT_MONITOR_RUNTIME__ = runtime;
}
