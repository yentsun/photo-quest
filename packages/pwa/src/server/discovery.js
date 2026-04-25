/**
 * @file Server discovery — probe a short list of candidate hosts for a
 * photo-quest server. Browsers can't do true network scanning, so we hit
 * likely URLs in parallel and return the ones that answer the `/network`
 * endpoint.
 */

/* Injected by Vite `define` from shared config at build time. */
const SERVER_PORT = __SERVER_PORT__;
const PROBE_TIMEOUT_MS = 1500;

function candidateHosts() {
  const { hostname } = window.location;
  const hosts = new Set(['localhost', '127.0.0.1']);
  if (hostname) hosts.add(hostname);
  return [...hosts];
}

async function probe(host) {
  const url = `http://${host}:${SERVER_PORT}/network`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const info = await res.json();
    return { host, url: `http://${host}:${SERVER_PORT}`, info };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Probe all candidates concurrently. Returns found servers in response order. */
export async function discoverServers() {
  const results = await Promise.all(candidateHosts().map(probe));
  return results.filter(Boolean);
}
