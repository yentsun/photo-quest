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

/* Interface names that are NOT reachable from LAN clients and should not be
 * advertised as the canonical address. Covers VPN/tunnel NICs plus common
 * container/virtual interfaces (Docker bridges, veth pairs, VM host-only NICs).
 * Real host bridges (br0, etc.) are left out — they often ARE the reachable LAN
 * interface. */
const NON_LAN_RE = /^(wg|wireguard|tailscale|zt|tun|tap|utun|ppp|ipsec|vpn|docker|veth|vbox|vmnet|virtualbox)[a-z0-9]*$/i;

/** An all-zero MAC is what virtual/tunnel adapters report (VPN clients, Hyper-V,
 *  WSL, …). A physical NIC always has a real hardware address. */
const ZERO_MAC_RE = /^(0{2}[:-]){5}0{2}$/;

/** Coerce the os.networkInterfaces() family value to a canonical check. */
function isIPv4(iface) {
  // Node returns the string 'IPv4' on modern versions, the numeric 4 on older.
  const family = String(iface.family);
  return family.toLowerCase() === 'ipv4' || family === '4';
}

/**
 * The interface's IPv4 prefix length, from `cidr` when present (Node >= 18) and
 * falling back to the netmask. Returns null when neither is usable.
 *
 * @param {import('node:os').NetworkInterfaceInfo} iface
 * @returns {number|null}
 */
function prefixLength(iface) {
  if (typeof iface.cidr === 'string' && iface.cidr.includes('/')) {
    const bits = Number(iface.cidr.slice(iface.cidr.lastIndexOf('/') + 1));
    if (Number.isFinite(bits)) return bits;
  }
  if (typeof iface.netmask === 'string') {
    const octets = iface.netmask.split('.');
    if (octets.length === 4) {
      let bits = 0;
      for (const octet of octets) {
        const n = Number(octet);
        if (!Number.isFinite(n) || n < 0 || n > 255) return null;
        bits += n.toString(2).split('').filter((c) => c === '1').length;
      }
      return bits;
    }
  }
  return null;
}

/**
 * A /31 or /32 host prefix can only address a single peer — that is a
 * point-to-point tunnel link (WireGuard assigns /32 to its address), never a LAN
 * other devices can reach.
 *
 * @param {import('node:os').NetworkInterfaceInfo} iface
 */
function isPointToPoint(iface) {
  const bits = prefixLength(iface);
  return bits !== null && bits >= 31;
}

/**
 * Classify an interface as a LAN interface or a tunnel/virtual one. Name
 * matching alone misses VPN adapters with vendor names (e.g. "BitLionFull"), so
 * the address shape (point-to-point prefix, all-zero MAC) is used too.
 *
 * @param {string} name
 * @param {import('node:os').NetworkInterfaceInfo} iface
 * @returns {'normal'|'tunnel'}
 */
function classifyInterface(name, iface) {
  if (NON_LAN_RE.test(name)) return 'tunnel';
  if (isPointToPoint(iface)) return 'tunnel';
  if (typeof iface.mac === 'string' && ZERO_MAC_RE.test(iface.mac)) return 'tunnel';
  return 'normal';
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
      rows.push({ name, address: iface.address, kind: classifyInterface(name, iface) });
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
