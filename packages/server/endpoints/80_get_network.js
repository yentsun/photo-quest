/**
 * @file GET /network -- Return server network info for connecting from other devices.
 */

import os from 'node:os';
import { json } from '../src/http.js';

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'GET',
    pathname: '/network',
  }, (req, res) => {
    const port = kojo.get('port');
    const ip = getLocalIP();

    json(res, 200, {
      local: `http://localhost:${port}`,
      network: ip ? `http://${ip}:${port}` : null,
      ip,
      port,
    });
  });
};
