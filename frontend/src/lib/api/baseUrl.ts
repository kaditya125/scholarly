/**
 * The ONE place the backend API base URL is decided. Every HTTP, SSE and WebSocket call derives
 * from getApiBaseUrl() / getWebSocketUrl(); nothing else reads VITE_API_URL or spells a host.
 *
 * Resolution (resolveApiBaseUrl):
 *   1. VITE_API_URL, when set — unless it points at a local host while the page is served from a
 *      real domain. That combination is a build that would send every request to the student's
 *      own machine; it is ignored (with a console error) in favour of rule 2. vite.config.ts also
 *      refuses to produce such a production build in the first place.
 *   2. On a non-local hostname: same-origin `${origin}/api`. Production serves the SPA and proxies
 *      /api from the same nginx host (https://sadhya.app → https://sadhya.app/api), so this is
 *      correct there and on any preview/staging domain without a rebuild.
 *   3. Local development: http://localhost:8080/api (the backend's dev port).
 */

export const LOCAL_DEV_API_URL = 'http://localhost:8080/api';

const LOCAL_HOSTNAME = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$|\.localhost$/i;

export function isLocalHostname(hostname: string | undefined | null): boolean {
  return !!hostname && LOCAL_HOSTNAME.test(hostname);
}

export function isLocalUrl(url: string): boolean {
  try {
    return isLocalHostname(new URL(url).hostname);
  } catch {
    return false;
  }
}

export interface ApiUrlEnvironment {
  envUrl?: string | null;
  /** window.location, or undefined outside a browser. */
  location?: { hostname: string; origin: string } | null;
  onIgnoredLocalEnv?: (envUrl: string) => void;
}

export function resolveApiBaseUrl({ envUrl, location, onIgnoredLocalEnv }: ApiUrlEnvironment): string {
  const env = typeof envUrl === 'string' ? envUrl.trim().replace(/\/+$/, '') : '';
  const onRealDomain = !!location?.hostname && !isLocalHostname(location.hostname);

  if (env) {
    if (onRealDomain && isLocalUrl(env)) onIgnoredLocalEnv?.(env);
    else return env;
  }
  if (onRealDomain) return `${location!.origin.replace(/\/+$/, '')}/api`;
  return LOCAL_DEV_API_URL;
}

/**
 * Build-time guard (vite.config.ts): a production bundle must never carry a local API URL —
 * every student's browser would call its own machine. Throws, failing the build.
 */
export function assertProductionApiUrl(mode: string, apiUrl: string | undefined): void {
  if (mode !== 'production' || !apiUrl) return;
  if (isLocalUrl(apiUrl)) {
    throw new Error(
      `[build] VITE_API_URL=${apiUrl} points at a local host in a production build. ` +
      `Set it to https://sadhya.app/api (frontend/.env.production) or leave it unset to use same-origin /api.`,
    );
  }
}

/** http(s)://host/api → ws(s)://host/<path>. The WebSocket host is never configured separately. */
export function toWebSocketUrl(apiBaseUrl: string, path: string): string {
  const origin = apiBaseUrl.replace(/\/api\/?$/, '').replace(/\/+$/, '');
  return origin.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:') + (path.startsWith('/') ? path : `/${path}`);
}

let cached: string | null = null;

export function getApiBaseUrl(): string {
  if (cached) return cached;
  cached = resolveApiBaseUrl({
    envUrl: import.meta.env.VITE_API_URL,
    location: typeof window !== 'undefined' ? window.location : null,
    onIgnoredLocalEnv: (u) =>
      console.error(`[api] VITE_API_URL=${u} points at a local host but this page is served from ${window.location.hostname}; using ${window.location.origin}/api instead.`),
  });
  return cached;
}

export function getWebSocketUrl(path: string): string {
  return toWebSocketUrl(getApiBaseUrl(), path);
}
