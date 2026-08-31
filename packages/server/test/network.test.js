/**
 * @file Tests for src/network.js -- reachable-IPv4 enumeration and the
 * canonical / alternative address selection that keeps shortcuts away from
 * the volatile WireGuard interface.
 */

import test from 'node:test';
import { listReachableIPv4, getServerAddresses } from '../src/network.js';

/* ------------------------------------------------------------------ */
/*  Fixtures -- mock os.networkInterfaces() output                     */
/* ------------------------------------------------------------------ */

const LAN = {
  address: '192.168.1.20',
  netmask: '255.255.255.0',
  family: 'IPv4',
  mac: '00:00:00:00:00:01',
  internal: false,
  cidr: '192.168.1.20/24',
};
const WG = {
  address: '10.0.0.5',
  netmask: '255.255.0.0',
  family: 'IPv4',
  mac: '00:00:00:00:00:02',
  internal: false,
  cidr: '10.0.0.5/16',
};
const LOOPBACK = {
  address: '127.0.0.1',
  netmask: '255.0.0.0',
  family: 'IPv4',
  mac: '00:00:00:00:00:03',
  internal: true,
  cidr: '127.0.0.1/8',
};
const IPV6 = {
  address: 'fe80::1',
  netmask: 'ffff:ffff:ffff:ffff::',
  family: 'IPv6',
  mac: '00:00:00:00:00:04',
  internal: false,
  cidr: 'fe80::1/64',
};
const DOCKER = {
  address: '172.17.0.1',
  netmask: '255.255.0.0',
  family: 'IPv4',
  mac: '00:00:00:00:00:05',
  internal: false,
  cidr: '172.17.0.1/16',
};

/** Typical host: a stable LAN eth0 plus a WG tunnel, plus loopback/IPv6. */
function typical() {
  return {
    'eth0': [LAN],
    'wg0': [WG],
    'lo': [LOOPBACK],
  };
}

/* ------------------------------------------------------------------ */
/*  listReachableIPv4()                                                */
/* ------------------------------------------------------------------ */

test('listReachableIPv4()', async (t) => {
  await t.test('excludes internal and non-IPv4 interfaces', (t) => {
    const rows = listReachableIPv4(typical());
    t.assert.strictEqual(rows.length, 2);
    t.assert.ok(!rows.some((r) => r.address === '127.0.0.1'));
    t.assert.ok(!rows.some((r) => r.address === 'fe80::1'));
  });

  await t.test('orders normal (LAN) before tunnel (WG)', (t) => {
    const rows = listReachableIPv4(typical());
    t.assert.strictEqual(rows[0].address, '192.168.1.20');
    t.assert.strictEqual(rows[0].kind, 'normal');
    t.assert.strictEqual(rows[1].address, '10.0.0.5');
    t.assert.strictEqual(rows[1].kind, 'tunnel');
  });
});

/* ------------------------------------------------------------------ */
/*  getServerAddresses()                                               */
/* ------------------------------------------------------------------ */

test('getServerAddresses()', async (t) => {
  await t.test('prefers the stable LAN interface over the WG tunnel', (t) => {
    const { canonical, alternatives } = getServerAddresses(typical());
    t.assert.strictEqual(canonical, '192.168.1.20');
    t.assert.deepEqual(alternatives, ['10.0.0.5']);
  });

  await t.test('honors an explicit preferredAddress override', (t) => {
    const { canonical, alternatives } = getServerAddresses(typical(), {
      preferredAddress: '10.0.0.5',
    });
    t.assert.strictEqual(canonical, '10.0.0.5');
    t.assert.deepEqual(alternatives, ['192.168.1.20']);
  });

  await t.test('honors an explicit preferredName override', (t) => {
    const { canonical } = getServerAddresses(typical(), {
      preferredName: 'wg0',
    });
    t.assert.strictEqual(canonical, '10.0.0.5');
  });

  await t.test('falls back to a tunnel when it is the only IPv4 interface', (t) => {
    const { canonical, alternatives } = getServerAddresses({ 'wg0': [WG] });
    t.assert.strictEqual(canonical, '10.0.0.5');
    t.assert.deepEqual(alternatives, []);
  });

  await t.test('returns null canonical when there is no reachable IPv4', (t) => {
    const { canonical, alternatives } = getServerAddresses({ 'lo': [LOOPBACK] });
    t.assert.strictEqual(canonical, null);
    t.assert.deepEqual(alternatives, []);
  });

  await t.test('copes with the numeric family value from older Node', (t) => {
    const { canonical } = getServerAddresses({
      'eth0': [{ ...LAN, family: 4 }],
    });
    t.assert.strictEqual(canonical, '192.168.1.20');
  });

  await t.test('demotes container/virtual NICs below the LAN interface', (t) => {
    const { canonical, alternatives } = getServerAddresses({
      'eth0': [LAN],
      'docker0': [DOCKER],
      'wg0': [WG],
    });
    t.assert.strictEqual(canonical, '192.168.1.20');
    t.assert.deepEqual(alternatives, ['172.17.0.1', '10.0.0.5']);
  });
});
