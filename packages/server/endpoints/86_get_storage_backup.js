/**
 * @file GET /storage/backup -- Download a consistent snapshot of the library
 * database.
 *
 * The snapshot is produced with `VACUUM INTO` into a temp file (see
 * src/storage.js) so the WAL is fully checkpointed and the live database is
 * never written to. The temp copy is streamed to the client and then removed,
 * including when the client aborts the download.
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { json } from '../src/http.js';
import { createDbSnapshot } from '../src/storage.js';

/** `YYYY-MM-DD` for the download filename. */
function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'GET',
    pathname: '/storage/backup',
  }, async (req, res) => {
    const db = kojo.get('db');
    let tmpDir = null;

    /* Streams may finish, error, or be aborted by the client; remove the temp
       directory exactly once either way. */
    let cleaned = false;
    const cleanup = () => {
      if (cleaned || !tmpDir) return;
      cleaned = true;
      fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    };

    try {
      tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'photo-quest-backup-'));
      const snapshot = path.join(tmpDir, 'library.db');
      createDbSnapshot(db, snapshot);

      const { size } = await fsp.stat(snapshot);
      logger.info(`[GET /storage/backup] snapshot ready (${size} bytes)`);

      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': size,
        'Content-Disposition': `attachment; filename="photo-quest-backup-${dateStamp()}.db"`,
      });

      const stream = fs.createReadStream(snapshot);
      stream.on('error', (err) => {
        logger.error(`[GET /storage/backup] stream failed: ${err.message}`);
        cleanup();
        res.destroy();
      });
      stream.on('close', cleanup);
      res.on('close', cleanup);
      stream.pipe(res);
    } catch (err) {
      logger.error(`[GET /storage/backup] failed: ${err.message}`);
      cleanup();
      if (!res.headersSent) json(res, 500, { error: 'Could not create a database backup' });
      else res.destroy();
    }
  });
};
