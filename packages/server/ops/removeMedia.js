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

  /* Get the file path before deleting the record. */
  const row = db.prepare('SELECT path FROM media WHERE id = ?').get(Number(id));
  const filePath = row ? row.path : null;

  const result = db.prepare('DELETE FROM media WHERE id = ?').run(Number(id));

  /* Delete the file from disk. */
  if (result.changes > 0 && filePath) {
    try {
      fs.unlinkSync(filePath);
      logger.info(`Deleted file from disk: ${filePath}`);
    } catch (err) {
      logger.warn(`Could not delete file from disk: ${filePath} — ${err.message}`);
    }
  }

  return { deleted: result.changes > 0, path: filePath };
}
