/**
 * @file Fetch a single media record by its numeric ID.
 *
 * Kojo op: accessed as `kojo.ops.getMediaById(id)`.
 *
 * @param {number|string} id - The media record's primary key.
 * @returns {Object|null} The media row, or null if not found.
 */

export default function (id) {
  const [kojo] = this;
  const db = kojo.get('db');

  const stmt = db.prepare('SELECT * FROM media WHERE id = ?');
  stmt.bind([Number(id)]);

  let result = null;
  if (stmt.step()) {
    result = stmt.getAsObject();
  }
  stmt.free();

  return result;
}
