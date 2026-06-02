/**
 * @file Update the title of a media item.
 *
 * @param {number} id
 * @param {string} title
 * @returns {Object|null} Updated media row, or null if not found.
 */

export default function (id, title) {
  const [kojo] = this;
  const db = kojo.get('db');

  const result = db.prepare(
    "UPDATE media SET title = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(String(title).trim(), Number(id));

  if (result.changes === 0) return null;

  return db.prepare('SELECT * FROM media WHERE id = ?').get(Number(id));
}
