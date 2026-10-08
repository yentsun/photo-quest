/**
 * @file Delete a media record by ID, its jobs, and the file from disk.
 *
 * Kojo op: accessed as `kojo.ops.removeMedia(id)`.
 * Removes from library AND deletes from disk in one action.
 *
 * @param {number|string} id - The media record's primary key.
 * @returns {{ deleted: boolean, path: string|null }} Whether a row was removed and its path.
 */

import fs from 'node:fs';
import path from 'node:path';
import { removeFromFailedSnapshot } from './listFailed.js';
import { broadcastSse } from '../src/sse.js';
import { THUMBS_DIR } from '../src/paths.js';

/**
 * Whether another media record still references `file` as its original path or
 * its transcoded output. `path` is UNIQUE, so the cross-reference that matters
 * is one row's `path` being another row's `transcoded_path` — the scanner can
 * import a transcode output as its own media. Removing the derived row must
 * never unlink the original record's playable file.
 */
function referencedByAnother(db, id, file) {
  if (!file) return false;
  return Boolean(db.prepare(
    'SELECT id FROM media WHERE id != ? AND (path = ? OR transcoded_path = ?)'
  ).get(id, file, file));
}

export default function (id) {
  const [kojo, logger] = this;
  const db = kojo.get('db');

  logger.debug(`id=${id}`);

  const row = db.prepare('SELECT path, transcoded_path FROM media WHERE id = ?').get(Number(id));
  if (!row) {
    logger.debug(`not in db: id=${id}`);
  } else {
    logger.debug(`found: id=${id} path=${row.path} transcoded=${row.transcoded_path}`);
  }
  const filePath = row ? row.path : null;
  const transcodedPath = row ? row.transcoded_path : null;

  /* Check whether either file is still referenced by another media record
     before deleting. `path` is UNIQUE, so the real case is a row whose `path`
     is another record's `transcoded_path` (a transcode output imported as its
     own media by an earlier scan). Deleting the derived row must never destroy
     the original record's playable file, and vice versa. */
  const keepFile = referencedByAnother(db, Number(id), filePath);
  const keepTranscoded = referencedByAnother(db, Number(id), transcodedPath);
  if (keepFile) {
    logger.debug(`original path ${filePath} is another record's transcoded_path, will not delete`);
  }
  if (keepTranscoded) {
    logger.debug(`transcoded path ${transcodedPath} is also referenced by another media, will not delete`);
  }

  const result = db.prepare('DELETE FROM media WHERE id = ?').run(Number(id));
  logger.debug(`db delete changes=${result.changes}`);

  if (result.changes > 0) {
    removeFromFailedSnapshot(kojo, [Number(id)]);
    if (filePath && !keepFile) {
      try {
        fs.unlinkSync(filePath);
        logger.info(`Deleted file from disk: ${filePath}`);
      } catch (err) {
        logger.warn(`Could not delete file from disk: ${filePath} — ${err.message}`);
      }
    }

    if (transcodedPath && !keepTranscoded) {
      try {
        fs.unlinkSync(transcodedPath);
        logger.info(`Deleted transcoded file from disk: ${transcodedPath}`);
      } catch (err) {
        logger.warn(`Could not delete transcoded file from disk: ${transcodedPath} — ${err.message}`);
      }
    }

    /* Also remove any cached thumbnail files for this media id. */
    try {
      if (fs.existsSync(THUMBS_DIR)) {
        const prefix = `${Number(id)}`;
        for (const entry of fs.readdirSync(THUMBS_DIR)) {
          const name = path.basename(entry);
          if (name === `${prefix}.jpg` || name.startsWith(`${prefix}_`)) {
            try {
              fs.unlinkSync(path.join(THUMBS_DIR, entry));
              logger.info(`Deleted thumbnail from disk: ${entry}`);
            } catch (err) {
              logger.warn(`Could not delete thumbnail from disk: ${entry} — ${err.message}`);
            }
          }
        }
      }
    } catch (err) {
      logger.warn(`Could not clean up thumbnails for id=${id}: ${err.message}`);
    }
  } else {
    logger.debug(`nothing deleted (id not found): id=${id}`);
  }

  /* Tell connected clients to drop this record from their caches so a removed
     media never lingers in a grid. */
  if (result.changes > 0) {
    broadcastSse({ type: 'media_removed', ids: [Number(id)] });
  }

  return { deleted: result.changes > 0, path: filePath };
}
