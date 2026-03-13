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
import { saveDb } from '../src/db.js';

export default function (id) {
  const [kojo, logger] = this;
  const db = kojo.get('db');

  /* Get the file path before deleting the record. */
  const pathStmt = db.prepare('SELECT path FROM media WHERE id = ?');
  pathStmt.bind([Number(id)]);
  let filePath = null;
  if (pathStmt.step()) {
    filePath = pathStmt.getAsObject().path;
  }
  pathStmt.free();

  db.run('DELETE FROM media WHERE id = ?', [Number(id)]);

  const stmt = db.prepare('SELECT changes() as c');
  stmt.step();
  const changes = stmt.getAsObject().c;
  stmt.free();

  saveDb();

  /* Delete the file from disk. */
  if (changes > 0 && filePath) {
    try {
      fs.unlinkSync(filePath);
      logger.info(`Deleted file from disk: ${filePath}`);
    } catch (err) {
      logger.warn(`Could not delete file from disk: ${filePath} — ${err.message}`);
    }
  }

  return { deleted: changes > 0, path: filePath };
}
