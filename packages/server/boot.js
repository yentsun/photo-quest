/**
 * @file Server bootstrap — initialises all services and returns a ready
 * kojo instance.
 *
 * Boot sequence:
 *  1. Create the kojo instance with custom directory names.
 *  2. Initialise the SQLite database (better-sqlite3) and store it in state.
 *  3. Store config values (port, routes table).
 *  4. Call kojo.ready() to auto-discover ops/ and endpoints/.
 *     Endpoints register their routes via the addHttpRoute op.
 *  5. Start the HTTP server via kojo.ops.http().
 *  6. Return the kojo instance for external use.
 */

import 'urlpattern-polyfill';
import Kojo from 'kojo';
import config from '@photo-quest/shared/config.js';
import { initDb } from './src/db.js';
import { resumeIncompleteScans } from './ops/scanMedia.js';

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_PATH = path.join(__dirname, 'photo-quest.log');
const THUMBS_DIR = path.join(__dirname, 'thumbs');

/* Tee stdout/stderr to both the original stream and a log file. */
const logStream = fs.createWriteStream(LOG_PATH, { flags: 'a' });
for (const streamName of ['stdout', 'stderr']) {
  const original = process[streamName].write.bind(process[streamName]);
  process[streamName].write = (chunk, ...args) => {
    const str = typeof chunk === 'string' ? chunk : chunk.toString();
    if (str.trim()) {
      const ts = new Date().toISOString().slice(11, 23);
      const line = `${ts} ${str}`;
      logStream.write(line);
      return original(line, ...args);
    }
    return original(chunk, ...args);
  };
}

export default async function boot() {

  const PORT = config.serverPort;

  /* Media paths -- directories the server can scan for media files.
   * Set via MEDIA_PATHS env var as semicolon-separated paths.
   * Example: MEDIA_PATHS=/home/user/Pictures;/home/user/Videos */
  const MEDIA_PATHS = process.env.MEDIA_PATHS
    ? process.env.MEDIA_PATHS.split(';').map(p => p.trim()).filter(Boolean)
    : [];

  /* Kojo -- event-driven microservice framework.
   * `functionsDir: 'ops'`  → business logic lives in ops/
   * `subsDir: 'endpoints'` → route handlers live in endpoints/ */
  const kojo = new Kojo({
    name: 'photo-quest',
    functionsDir: 'ops',
    subsDir: 'endpoints',
    logLevel: 'debug',
  });

  /* HTTP route table -- endpoints push into this via addHttpRoute op. */
  kojo.set('routes', []);

  /* Config values that ops and endpoints need. */
  kojo.set('port', PORT);
  kojo.set('mediaPaths', MEDIA_PATHS);
  kojo.set('settingsPath', process.env.SETTINGS_PATH || null);

  if (MEDIA_PATHS.length > 0) {
    console.debug(`[boot] Media paths configured: ${MEDIA_PATHS.join(', ')}`);
  }

  /* SQLite database (better-sqlite3, native binding with WAL mode).
   * Stored in kojo state so all ops can access it via kojo.get('db'). */
  console.debug('[boot] Initialising database...');
  const db = initDb();
  kojo.set('db', db);

  /* Clean up thumbnail files that belong to media records which no longer
   * exist (e.g., leftovers from deletions before cleanup was added). */
  cleanupThumbs(db);

  /* Auto-discover ops/ and endpoints/. During this phase every
   * endpoint file calls kojo.ops.addHttpRoute() to register its route. */
  console.debug('[boot] Loading ops and endpoints...');
  await kojo.ready();

  /* Unpack ops for direct access. */
  const { requestMiddleware } = kojo.ops;

  /* All routes are now registered -- start the HTTP server. */
  const routes = kojo.get('routes') || [];
  console.debug(`[boot] ${routes.length} routes registered`);
  requestMiddleware();

  /* Resume any imports that were interrupted by a previous crash/restart. */
  resumeIncompleteScans(kojo, console);

  return kojo;
}

function cleanupThumbs(db) {
  try {
    if (!fs.existsSync(THUMBS_DIR)) {
      console.debug(`[boot] Thumbs dir does not exist, skipping cleanup: ${THUMBS_DIR}`);
      return;
    }
    const files = fs.readdirSync(THUMBS_DIR);
    let checked = 0;
    let removed = 0;
    for (const file of files) {
      if (!file.toLowerCase().endsWith('.jpg')) continue;
      const base = path.basename(file, '.jpg');
      const id = Number(base.split('_')[0]);
      if (!Number.isFinite(id)) continue;
      checked++;
      const exists = db.prepare('SELECT 1 FROM media WHERE id = ?').get(id);
      if (exists) continue;
      try {
        fs.unlinkSync(path.join(THUMBS_DIR, file));
        console.log(`[boot] Removed orphan thumbnail: ${file}`);
        removed++;
      } catch (err) {
        console.warn(`[boot] Could not remove orphan thumbnail ${file}: ${err.message}`);
      }
    }
    console.log(`[boot] Thumbnail cleanup: checked ${checked} file(s), removed ${removed} orphan(s)`);
  } catch (err) {
    console.warn(`[boot] Thumbnail cleanup failed: ${err.message}`);
  }
}

/* Self-invoke when run directly (e.g. `node boot.js`). */
boot();
