/**
 * @file Resolves the API base origin for the Photo Quest client.
 *
 * The app is normally served by the Photo Quest server itself, so API calls and
 * media URLs are same-origin relative paths (`/media`, `/stream/123`, …). No base
 * is required.
 *
 * In a native shell (Capacitor) the UI is bundled and served from a local origin
 * (`http://localhost`) while the media library lives on a separate plain-HTTP
 * server — a LAN IP, `localhost` (same machine), or a WireGuard IP. In that case
 * the API base must be set to that server so every relative path resolves against
 * the right origin.
 *
 * The base is persisted in localStorage so it survives reloads, and any code that
 * builds a URL back to the server routes it through `resolveApiUrl`.
 */

const API_BASE_KEY = 'photoquest.apiBase';

let _apiBase = null;

function load() {
  if (_apiBase !== null) return _apiBase;
  try { _apiBase = localStorage.getItem(API_BASE_KEY) || ''; } catch { _apiBase = ''; }
  return _apiBase;
}

/**
 * The current API base origin, or '' for same-origin (the app is served by the
 * server). Trailing slash is stripped.
 * @returns {string}
 */
export function getApiBase() {
  return load().replace(/\/+$/, '');
}

/**
 * Set (or clear with an empty value) the API base origin. Persisted so the
 * chosen server survives reloads.
 * @param {string} base
 */
export function setApiBase(base) {
  _apiBase = (base || '').replace(/\/+$/, '');
  try {
    if (_apiBase) localStorage.setItem(API_BASE_KEY, _apiBase);
    else localStorage.removeItem(API_BASE_KEY);
  } catch { /* ignore */ }
}

/** Alias for clearing the configured base (back to same-origin). */
export function clearApiBase() { setApiBase(''); }

/**
 * The origin (scheme://host[:port]) the API is served from. When the base is
 * empty this is the current page origin; otherwise the configured server origin.
 *
 * Used as the anchor for `new URL(path, base)` so query-string builders resolve
 * relative to the API server rather than the (possibly bundled) page origin.
 * @returns {string}
 */
export function apiOrigin() {
  const base = getApiBase();
  if (base) return base;
  return window.location.origin;
}

/**
 * Resolve a server path (e.g. `/media`) against the configured API base.
 * When the base is empty the path is returned unchanged (same-origin), so the
 * default web/PWA behaviour is unaffected. Absolute URLs pass through untouched.
 *
 * @param {string|URL} path
 * @returns {string}
 */
export function resolveApiUrl(path) {
  if (!path) return path;
  if (typeof path !== 'string') path = String(path);
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return path; // absolute (http:, https:)
  const base = getApiBase();
  if (!base) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}
