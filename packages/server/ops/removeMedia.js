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

export default function (id) {
  const [kojo, logger] = this;
  const db = kojo.get('db');

  logger.debug(`[removeMedia] id=${id}`);

  const row = db.prepare('SELECT path, transcoded_path FROM media WHERE id = ?').get(Number(id));
  if (!row) {
    logger.debug(`[removeMedia] not in db: id=${id}`);
  } else {
    logger.debug(`[removeMedia] found: id=${id} path=${row.path} transcoded=${row.transcoded_path}`);
  }
  const filePath = row ? row.path : null;
  const transcodedPath = row ? row.transcoded_path : null;

  const result = db.prepare('DELETE FROM media WHERE id = ?').run(Number(id));
  logger.debug(`[removeMedia] db delete changes=${result.changes}`);

  if (result.changes > 0) {
    for (const p of [filePath, transcodedPath]) {
      if (!p) continue;
      try {
        fs.unlinkSync(p);
        logger.info(`Deleted file from disk: ${p}`);
      } catch (err) {
        logger.warn(`Could not delete file from disk: ${p} — ${err.message}`);
      }
    }
  } else {
    logger.debug(`[removeMedia] nothing deleted (id not found): id=${id}`);
  }

  return { deleted: result.changes > 0, path: filePath };
}
