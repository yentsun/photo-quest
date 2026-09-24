/**
 * @file Known-servers pool + basic server discovery.
 *
 * The app is served by the Photo Quest server, so same-origin relative URLs
 * work out of the box. Over time the app learns additional reachable
 * addresses (e.g. the LAN URL surfaced in the header QR) and stores them in
 * localStorage. If the current origin ever becomes unreachable, discovery
 * probes each known server and redirects to the first one that responds.
 */

import { resolveApiUrl } from '../config/apiBase.js';

const STORAGE_KEY = 'photoquest.knownServers';
const ACTIVE_KEY = 'photoquest.activeServer';

/** @type {string[]} Known server base URLs. */
let known = null;

function load() {
  if (known !== null) return known;
  try {
    known = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(known)) known = [];
  } catch {
    known = [];
  }
  return known;
}

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(known)); } catch {}
}

/** Normalize a server URL to a base origin (strip trailing slash). */
export function normalizeServerUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    u.pathname = '/';
    u.search = '';
    u.hash = '';
    return u.origin + '/';
  } catch {
    return null;
  }
}

/** The current origin (used when the app is served by the server itself). */
export function currentServerUrl() {
  return window.location.origin + '/';
}

/** @returns {string[]} Known server base URLs. */
export function getKnownServers() {
  return [...load()];
}

/** Add a server URL to the pool (deduped). Returns true if newly added. */
export function addKnownServer(url) {
  const normalized = normalizeServerUrl(url);
  if (!normalized) return false;
  load();
  if (known.includes(normalized)) return false;
  known.push(normalized);
  persist();
  return true;
}

/** Remove a server URL from the pool. */
export function removeKnownServer(url) {
  const normalized = normalizeServerUrl(url);
  if (!normalized) return;
  load();
  known = known.filter(s => s !== normalized);
  persist();
}

/** @returns {string|null} The last server we connected through. */
export function getActiveServer() {
  try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; }
}

/** Remember which server the app connected through. */
export function setActiveServer(url) {
  const normalized = normalizeServerUrl(url);
  try {
    if (normalized) localStorage.setItem(ACTIVE_KEY, normalized);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {}
}

/**
 * True when a parsed body actually looks like the Photo Quest `/network`
 * payload. A static host (or the Vite preview server) answers unknown paths
 * with the SPA `index.html` and HTTP 200, so `res.ok` alone would mistake the
 * UI host for the API server. Requiring the JSON shape is what distinguishes
 * them.
 *
 * @param {unknown} data
 * @returns {boolean}
 */
function isNetworkPayload(data) {
  return !!data && typeof data === 'object'
    && (typeof data.port === 'number' || 'canonical' in data || 'local' in data);
}

/**
 * Fetch and validate `/network` from a candidate server.
 *
 * @param {string|null} [base] Absolute server base URL. Pass null/'' to probe
 *   the configured API base (or the page origin when none is configured).
 * @param {{ timeout?: number }} [opts]
 * @returns {Promise<Object|null>} The `/network` payload, or null when nothing
 *   that is really a Photo Quest server answered.
 */
export async function fetchServerNetwork(base = null, { timeout = 3000 } = {}) {
  const normalized = base ? (normalizeServerUrl(base) ?? base) : null;
  const path = normalized ? `${normalized}network` : '/network';
  try {
    const res = await fetch(resolveApiUrl(path), { cache: 'no-store', signal: AbortSignal.timeout(timeout) });
    if (!res.ok) return null;
    const data = await res.json();
    return isNetworkPayload(data) ? data : null;
  } catch {
    return null;
  }
}

/** True if the app's current base is a reachable Photo Quest server. */
function isCurrentOriginReachable() {
  return fetchServerNetwork(null).then(Boolean);
}

/**
 * Probe a candidate server base URL. Resolves true only when a real Photo
 * Quest server answers (see {@link fetchServerNetwork}). Same-origin and
 * cross-origin are both supported (the server sends CORS headers). Uses a
 * short timeout so an unroutable/stale address fails fast instead of stalling
 * boot for the browser's default connect timeout (~20s+).
 */
async function probeServer(base) {
  return (await fetchServerNetwork(base)) !== null;
}

/**
 * Public probe of a single server base URL. Resolves true if `/network`
 * responds with a valid Photo Quest payload. Used by the connect screen and
 * the connections view to validate a candidate address.
 * @param {string} base
 * @returns {Promise<boolean>}
 */
export function probeServerUrl(base) {
  return probeServer(base);
}

/**
 * Basic discovery: returns the best server URL to use.
 * 1. If the current origin is reachable, prefer it.
 * 2. Otherwise probe every known server concurrently and return the first
 *    reachable one.
 */
export async function discoverServer() {
  // The current origin (the server that served this page) is authoritative.
  // Only fall back to pool discovery when it is genuinely unreachable.
  if (await isCurrentOriginReachable()) {
    setActiveServer(currentServerUrl());
    return currentServerUrl();
  }

  // Otherwise try the last server we connected through, then the pool.
  const active = getActiveServer();
  if (active && active !== currentServerUrl()) {
    if (await probeServer(active)) return active;
  }

  const candidates = load();
  const results = await Promise.all(candidates.map(async (candidate) => ({
    candidate,
    ok: await probeServer(candidate),
  })));
  const hit = results.find(r => r.ok);
  if (hit) {
    setActiveServer(hit.candidate);
    return hit.candidate;
  }

  return currentServerUrl();
}

/**
 * Redirect the whole page to the given server base URL if it differs from the
 * current origin. Used when the current origin is unreachable.
 */
export function redirectToServer(base) {
  if (!base) return;
  if (base === currentServerUrl()) return;
  const target = new URL(base, window.location.href).toString();
  window.location.replace(target);
}

/**
 * Seed the known-server pool from a `/network` payload. Registers the
 * `local`, `canonical`/`network`, and every `alternatives` URL so the pool
 * covers the same machine, the stable LAN interface, and tunnel addresses
 * (e.g. WireGuard). Returns the newly added URLs.
 *
 * @param {{ local?: string, canonical?: string, network?: string, alternatives?: string[] }} network
 * @returns {string[]}
 */
export function seedFromNetwork(network) {
  const added = [];
  const push = (url) => { if (url && addKnownServer(url)) added.push(normalizeServerUrl(url)); };
  push(network?.local);
  push(network?.canonical);
  push(network?.network); // legacy alias for canonical
  for (const alt of network?.alternatives ?? []) push(alt);
  return added;
}
