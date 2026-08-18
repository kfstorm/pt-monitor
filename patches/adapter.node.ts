/**
 * Node platform adapter for PT-depiler's @pkg/site package.
 *
 * The runtime is injected by pt-monitor through globalThis.__PT_MONITOR_RUNTIME__.
 * This keeps the upstream schema/definition code almost untouched.
 */
import axiosRaw, {
  AxiosHeaders,
  type AxiosError,
  type AxiosRequestConfig,
  type AxiosResponse,
} from "axios";

import type { ISiteUserConfig } from "../types";

interface NodeRuntime {
  getRequestHeaders(url: string): Record<string, string>;
  toDocument(html: string): Document;
  flaresolverrFetch?(url: string): Promise<{
    html: string;
    status: number;
    url: string;
    headers?: Record<string, string>;
  }>;
  getCookie?(detail: any): Promise<any>;
}

function runtime(): NodeRuntime {
  const value = (globalThis as any).__PT_MONITOR_RUNTIME__ as NodeRuntime | undefined;
  if (!value) throw new Error("PT monitor Node runtime has not been installed");
  return value;
}

function rot13(value: string): string {
  return value.replace(/[A-Za-z]/g, (ch) => {
    const base = ch <= "Z" ? 65 : 97;
    return String.fromCharCode(((ch.charCodeAt(0) - base + 13) % 26) + base);
  });
}

function decodeProtectedUrl(value: string): string {
  // PT-depiler definitions may ROT13-protect a full tracker URL:
  //   uggc://...  -> http://...
  //   uggcf://... -> https://...
  return /^uggcfs?:\/\//i.test(value) || /^uggcf?:\/\//i.test(value) ? rot13(value) : value;
}

function fullUrl(config: AxiosRequestConfig): string {
  const raw = decodeProtectedUrl(config.url ?? "/");
  if (/^https?:\/\//i.test(raw)) return raw;
  if (!config.baseURL) throw new Error(`Cannot resolve relative URL without baseURL: ${raw}`);
  const baseURL = decodeProtectedUrl(config.baseURL);
  return new URL(raw, baseURL).toString();
}

function responseText(response: AxiosResponse | undefined): string {
  if (!response) return "";
  if (typeof response.data === "string") return response.data;
  const request = response.request as any;
  if (typeof request?.responseText === "string") return request.responseText;
  if (response.data instanceof Document) return response.data.documentElement?.outerHTML ?? "";
  return "";
}

export function isCloudflareBlocked(response: AxiosResponse): boolean {
  if (!response) return false;
  const headers = response.headers as any;
  if (headers?.["cf-mitigated"] === "challenge" || headers?.get?.("cf-mitigated") === "challenge") return true;
  if ([521, 522, 523].includes(response.status)) return true;
  if (response.status === 403 && /Enable JavaScript and cookies to continue|challenge-platform|cf-chl-/i.test(responseText(response))) {
    return true;
  }
  return false;
}

function normalizeResponse<T>(response: AxiosResponse<T>): AxiosResponse<T> {
  const rt = runtime();
  const url = fullUrl(response.config);
  const rawText = typeof response.data === "string" ? response.data : "";

  const req = ((response.request ??= {}) as any);
  req.responseURL = url;
  req.responseType = response.config.responseType;
  if (rawText) req.responseText = rawText;

  if (response.config.responseType === "document" && typeof response.data === "string") {
    response.data = rt.toDocument(response.data) as T;
  }

  return response;
}

export const axios = axiosRaw.create();

axios.interceptors.request.use(async (config) => {
  const rt = runtime();
  const url = fullUrl(config);

  // Resolve protected/relative PT-depiler URLs before axios sees them. Axios'
  // Node adapter cannot dispatch custom schemes such as `uggcf:`.
  config.url = url;
  config.baseURL = undefined;

  const headers = AxiosHeaders.from(config.headers);
  for (const [name, value] of Object.entries(rt.getRequestHeaders(url))) {
    if (!headers.has(name)) headers.set(name, value);
  }
  config.headers = headers;
  return config;
});

axios.interceptors.response.use(
  (response) => normalizeResponse(response),
  async (error: AxiosError) => {
    const response = error.response as AxiosResponse | undefined;
    const config = error.config as (AxiosRequestConfig & { __ptMonitorCfRetried?: boolean }) | undefined;

    if (response && config && isCloudflareBlocked(response) && !config.__ptMonitorCfRetried) {
      const rt = runtime();
      if (rt.flaresolverrFetch) {
        config.__ptMonitorCfRetried = true;
        const url = fullUrl(config);
        const solved = await rt.flaresolverrFetch(url);
        const synthetic: AxiosResponse = {
          data: config.responseType === "document" ? rt.toDocument(solved.html) : solved.html,
          status: solved.status,
          statusText: String(solved.status),
          headers: AxiosHeaders.from(solved.headers ?? {}),
          config: config as any,
          request: {
            responseURL: solved.url,
            responseType: config.responseType,
            responseText: solved.html,
          },
        };
        return synthetic;
      }
    }

    return Promise.reject(error);
  },
);

const runtimeStorage = new Map<string, unknown>();

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function store(
  siteId: string,
  key: string,
  value: any,
  field: keyof ISiteUserConfig = "runtimeSettings",
): Promise<void> {
  runtimeStorage.set(`${field}:${siteId}:${key}`, value);
}

export async function retrieve<T>(
  siteId: string,
  key: string,
  field: keyof ISiteUserConfig = "runtimeSettings",
): Promise<T | null> {
  return (runtimeStorage.get(`${field}:${siteId}:${key}`) as T | undefined) ?? null;
}

export async function retrieveStore(_store: unknown, _keyPath: string): Promise<any> {
  return null;
}

export async function cookie(detail: any): Promise<any> {
  return (await runtime().getCookie?.(detail)) ?? null;
}
