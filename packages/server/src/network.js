/**
 * @file Server network address helpers.
 *
 * Single source of truth for enumerating reachable IPv4 addresses so the
 * /network endpoint, the server startup log, and the "connect from another
 * device" URL all agree on which address to advertise.
 *
 * The problem this solves: the WireGuard (10.0.0.x) interface comes and goes,
 * and any shortcut / QR pinned to it dies. We prefer a stable, non-tunnel LAN
 * interface and expose tunnel addresses only as alternatives.
 */

import os from 'node:os';

/** Interface names that indicate a VPN/tunnel and are therefore NOT stable. */
const TUNNEL_RE = /^(wg|wireguard|tailscale|zt|tun|tap|utun|ppp|ipsec|vpn)\d*$/i;

/** Coerce the os.networkInterfaces() family value to a canonical check. */
function isIPv4(iface) {
  // Node returns the string 'IPv4' on modern versions, the numeric 4 on older.
  const family = String(iface.family);
  return family.toLowerCase() === 'ipv4' || family === '4';
}

/**
 * Enumerate every non-internal IPv4 interface, normal (non-tunnel) first.
 *
 * @param {NodeJS.Dict<import('node:os').NetworkInterfaceInfo[]>} [interfaces]
 * @returns {{ name: string, address: string, kind: 'normal'|'tunnel' }[]}
 */
export function listReachableIPv4(interfaces = os.networkInterfaces()) {
  const rows = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (!isIPv4(iface)) continue;
      if (iface.internal) continue;
      const kind = TUNNEL_RE.test(name) ? 'tunnel' : 'normal';
      rows.push({ name, address: iface.address, kind });
    }
  }
  // Stable ordering: normal interfaces first, then tunnels; insertion order
  // is preserved within each group.
  rows.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'normal' ? -1 : 1));
  return rows;
}

/**
 * Resolve the canonical (preferred, stable) address and the alternatives.
 *
 * Preference order:
 *   1. An explicitly preferred address or interface name (future config).
 *   2. The first non-tunnel ("normal") interface -- e.g. the stable LAN IP.
 *   3. Any address at all (tunnel included) rather than none.
 *
 * @param {NodeJS.Dict<import('node:os').NetworkInterfaceInfo[]>} [interfaces]
 * @param {{ preferredName?: string, preferredAddress?: string }} [opts]
 * @returns {{ canonical: string|null, alternatives: string[] }}
 */
export function getServerAddresses(interfaces = os.networkInterfaces(), opts = {}) {
  const rows = listReachableIPv4(interfaces);
  const pick = (pred) => rows.find(pred) || null;

  const canonicalRow =
    pick((r) => (opts.preferredAddress ? r.address === opts.preferredAddress : false)) ||
    pick((r) => (opts.preferredName ? r.name === opts.preferredName : false)) ||
    pick((r) => r.kind === 'normal') ||
    rows[0] ||
    null;

  const canonical = canonicalRow ? canonicalRow.address : null;
  const alternatives = rows.map((r) => r.address).filter((a) => a !== canonical);
  return { canonical, alternatives };
}
