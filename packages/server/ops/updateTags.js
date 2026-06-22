/**
 * @file Update the tags array for a media item.
 *
 * Kojo op: accessed as `kojo.ops.updateTags(id, tags)`.
 * Tags are stored as a JSON array string in the database.
 */

export default function (id, tags) {
  const [kojo] = this;
  const db = kojo.get('db');

  const result = db.prepare(
    "UPDATE media SET tags = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(JSON.stringify(tags), Number(id));

  if (result.changes === 0) return null;

  const media = db.prepare('SELECT * FROM media WHERE id = ?').get(Number(id));
  media.tags = JSON.parse(media.tags || '[]');
  return media;
}
