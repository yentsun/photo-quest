/**
 * @file GET /storage -- Disk usage stats for the library.
 *
 * Reports the size of the database (plus its WAL sidecars), the generated
 * thumbnails, the transcoded outputs and the original media, along with free
 * space on every volume the library touches. Powers the Storage section of the
 * Connections modal.
 */

import { json } from '../src/http.js';
import { DB_PATH } from '../src/db.js';
import { THUMBS_DIR } from '../src/paths.js';
import { collectStorageStats } from '../src/storage.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'GET',
    pathname: '/storage',
  }, async (req, res) => {
    try {
      const stats = await collectStorageStats({
        db: kojo.get('db'),
        dbPath: DB_PATH,
        thumbsDir: THUMBS_DIR,
      });
      json(res, 200, stats);
    } catch (err) {
      logger.error(`[GET /storage] failed: ${err.message}`);
      json(res, 500, { error: 'Could not collect storage stats' });
    }
  });
};
