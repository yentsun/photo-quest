/**
 * @file Serves the built web app (packages/web/dist) as a plain static host.
 *
 * Why this exists alongside `vite preview`: Vite's preview server inherits
 * `server.proxy`, so the API is reachable at the same origin as the UI. That is
 * convenient for development, but it makes the app look same-origin and hides
 * the bundled-shell case (Capacitor), where the UI is served from one origin and
 * the library lives on a separate plain-HTTP server.
 *
 * This server does no proxying and no API rewriting. Unknown paths fall through
 * to index.html (a realistic SPA host), so `/network` answers with HTML rather
 * than a server payload — the app must then use its Connect screen and a
 * configured API base, exactly as it does in the native wrapper.
 *
 * Usage: pnpm --filter @photo-quest/web serve
 *        PORT=8080 pnpm --filter @photo-quest/web serve
 */

import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '@photo-quest/shared/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, '..', 'dist');
const PORT = Number(process.env.PORT) || config.webappPort;
const HOST = process.env.HOST || '0.0.0.0';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/** Send a file, or fall back to index.html for SPA routes. */
function send(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = path.join(DIST_DIR, decodeURIComponent(url.pathname));
  const isFile = requested.startsWith(DIST_DIR) && existsSync(requested) && statSync(requested).isFile();
  const file = isFile ? requested : path.join(DIST_DIR, 'index.html');

  if (!existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found — run pnpm --filter @photo-quest/web build first.');
    return;
  }

  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    /* The shell must never be cached: a stale index.html would keep pointing at
       old hashed bundles after a rebuild. */
    'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=3600',
  });
  if (req.method === 'HEAD') { res.end(); return; }
  createReadStream(file).pipe(res);
}

if (!existsSync(path.join(DIST_DIR, 'index.html'))) {
  console.error(`No build found at ${DIST_DIR}.`);
  console.error('Run: pnpm --filter @photo-quest/web build');
  process.exit(1);
}

createServer(send).listen(PORT, HOST, () => {
  const apiPort = config.serverPort;
  console.log(`Serving ${DIST_DIR}`);
  console.log(`  UI  → http://localhost:${PORT}`);
  console.log(`  API → http://localhost:${apiPort} (separate origin, not proxied)`);
  console.log('The app will ask you to connect to a server on first load.');
});
