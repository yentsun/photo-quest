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
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { json } from '../src/http.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Path to the built web client. */
const STATIC_DIR = path.join(__dirname, '..', '..', 'web', 'dist');

/** Common MIME types for static file serving. */
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

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

    const start = Date.now();
    const url = new URL(req.url, `http://${req.headers.host}`);

    /* Log when the response finishes. */
    res.on('finish', () => {
      const ms = Date.now() - start;
      logger.debug(`${req.method} ${url.pathname} → ${res.statusCode} (${ms}ms)`);
    });

    try {
      /* Find matching route. */
      for (const route of routes) {
        if (route.method !== req.method) continue;

        const match = route.pattern.exec({ pathname: url.pathname });
        if (match) {
          return await route.handler(req, res, match.pathname.groups);
        }
      }

      /* No API route matched -- try serving static files from web/dist/. */
      if (req.method === 'GET') {
        const served = serveStatic(url.pathname, res);
        if (served) return;
      }

      json(res, 404, { error: 'Not found' });
    } catch (err) {
      logger.error(`${req.method} ${url.pathname} error:`, err);
      json(res, 500, { error: 'Internal server error' });
    }
  });

  server.listen(PORT, () => {
    logger.info(`Server listening on http://localhost:${PORT}`);
  });
}

/**
 * Serve a static file from the web/dist/ directory.
 * Falls back to index.html for SPA client-side routing.
 *
 * @param {string} pathname - The URL pathname to resolve.
 * @param {import('http').ServerResponse} res
 * @returns {boolean} True if a file was served.
 */
function serveStatic(pathname, res) {
  if (!fs.existsSync(STATIC_DIR)) return false;

  /* Try the exact file first (e.g. /assets/index-abc.js). */
  let filePath = path.join(STATIC_DIR, pathname);

  /* Prevent directory traversal. */
  if (!filePath.startsWith(STATIC_DIR)) return false;

  /* If requesting root or a path without extension, serve index.html
   * so React Router can handle client-side routes. */
  if (!path.extname(filePath)) {
    filePath = path.join(STATIC_DIR, 'index.html');
  }

  if (!fs.existsSync(filePath)) return false;

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  res.writeHead(200, { 'Content-Type': contentType });
  fs.createReadStream(filePath).pipe(res);
  return true;
}
