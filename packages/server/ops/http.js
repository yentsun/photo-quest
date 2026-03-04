/**
 * @file HTTP server op -- boots the Node HTTP server and dispatches
 * requests to individual handler files using Node's built-in URLPattern API.
 *
 * Kojo op: called as `kojo.ops.http()` from index.js after all endpoints
 * have registered their routes via `addHttpRoute`.
 *
 * This file only handles server creation, CORS, and the dispatch loop.
 */

import http from 'node:http';
import { json } from '../src/http.js';

export default function () {
  const [kojo, logger] = this;
  const PORT = kojo.get('port');
  const routes = kojo.get('routes') || [];

  const server = http.createServer(async (req, res) => {
    /* CORS headers for dev. */
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);

    try {
      /* Find matching route. */
      for (const route of routes) {
        if (route.method !== req.method) continue;

        const match = route.pattern.exec({ pathname: url.pathname });
        if (match) {
          return await route.handler(req, res, match.pathname.groups);
        }
      }

      /* No match -- 404. */
      json(res, 404, { error: 'Not found' });
    } catch (err) {
      logger.error('Request error:', err);
      json(res, 500, { error: 'Internal server error' });
    }
  });

  server.listen(PORT, () => {
    logger.info(`Server listening on http://localhost:${PORT}`);
  });
}
