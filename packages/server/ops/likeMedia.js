/**
 * @file Increment the like count for a media item.
 *
 * Kojo op: accessed as `kojo.ops.likeMedia(id)`.
 *
 * Likes are cumulative -- each call adds 1 to the total count.
 * There is no limit on how many times a media item can be liked.
 *
 * @param {number|string} id - The media record's primary key.
 * @returns {Object|null} The updated media row, or null if not found.
 */

import { saveDb } from '../src/db.js';

export default function (id) {
  const [kojo] = this;
  const db = kojo.get('db');

  db.run(
    'UPDATE media SET likes = likes + 1, updated_at = datetime("now") WHERE id = ?',
    [Number(id)]
  );

  const changes = db.getRowsModified();
  if (changes === 0) {
    return null;
  }

  saveDb(db);

  // Return the updated record
  const stmt = db.prepare('SELECT * FROM media WHERE id = ?');
  stmt.bind([Number(id)]);

  let result = null;
  if (stmt.step()) {
    result = stmt.getAsObject();
  }
  stmt.free();

  return result;
}
