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

export default function (id) {
  const [kojo] = this;
  const db = kojo.get('db');

  const result = db.prepare(
    'UPDATE media SET likes = likes + 1, updated_at = datetime("now") WHERE id = ?'
  ).run(Number(id));

  if (result.changes === 0) {
    return null;
  }

  return db.prepare('SELECT * FROM media WHERE id = ?').get(Number(id));
}
