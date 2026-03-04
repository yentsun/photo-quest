/**
 * @file Delete a media record by ID (cascades to its jobs).
 *
 * Kojo op: accessed as `kojo.ops.removeMedia(id)`.
 *
 * @param {number|string} id - The media record's primary key.
 * @returns {{ deleted: boolean }} Whether a row was actually removed.
 */

import { saveDb } from '../src/db.js';

export default function (id) {
  const [kojo] = this;
  const db = kojo.get('db');

  db.run('DELETE FROM media WHERE id = ?', [Number(id)]);

  const stmt = db.prepare('SELECT changes() as c');
  stmt.step();
  const changes = stmt.getAsObject().c;
  stmt.free();

  /* Persist deletion to disk. */
  saveDb();

  return { deleted: changes > 0 };
}
