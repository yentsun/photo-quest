/**
 * @file GET /network -- Return server network info for connecting from other devices.
 */

import { json } from '../src/http.js';
import { getServerAddresses, getDeviceName } from '../src/network.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'GET',
    pathname: '/network',
  }, (req, res) => {
    const port = kojo.get('port');
    const { canonical, alternatives } = getServerAddresses();

    json(res, 200, {
      /* Stable device identity so clients can recognise the same server
         reached through different addresses. */
      name: getDeviceName(),
      local: `http://localhost:${port}`,
      /* Primary recommended address: a stable, non-tunnel LAN IP. */
      network: canonical ? `http://${canonical}:${port}` : null,
      ip: canonical,
      port,
      /* Extended: the same stable address plus every other reachable address
         (e.g. the WireGuard IP), so clients can pick whichever is reachable. */
      canonical: canonical ? `http://${canonical}:${port}` : null,
      alternatives: alternatives.map((addr) => `http://${addr}:${port}`),
    });
  });
};
