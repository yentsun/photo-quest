/**
 * @file Delete a media record by ID, its jobs, and the file from disk.
 *
 * Kojo op: accessed as `kojo.ops.removeMedia(id)`.
 * LAW 1.34: removes from library AND deletes from disk in one action.
 *
 * @param {number|string} id - The media record's primary key.
 * @returns {{ deleted: boolean, path: string|null }} Whether a row was removed and its path.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const THUMBS_DIR = path.join(__dirname, '..', 'thumbs');

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

  /* Check whether the transcoded file is shared by another media record
     before deleting. Prevents accidentally deleting a file that another
     record (e.g. a duplicate imported from the same folder) also points to. */
  let keepTranscoded = false;
  if (transcodedPath) {
    const shared = db.prepare(
      'SELECT id FROM media WHERE id != ? AND (path = ? OR transcoded_path = ?)'
    ).get(Number(id), transcodedPath, transcodedPath);
    if (shared) {
      logger.debug(`transcoded path ${transcodedPath} also referenced by media ${shared.id}, will not delete`);
      keepTranscoded = true;
    }
  }

  const result = db.prepare('DELETE FROM media WHERE id = ?').run(Number(id));
  logger.debug(`db delete changes=${result.changes}`);

  if (result.changes > 0) {
    for (const p of [filePath]) {
      if (!p) continue;
      try {
        fs.unlinkSync(p);
        logger.info(`Deleted file from disk: ${p}`);
      } catch (err) {
        logger.warn(`Could not delete file from disk: ${p} — ${err.message}`);
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

  return { deleted: result.changes > 0, path: filePath };
}
