/**
 * @file Update the tags array for a media item.
 *
 * Kojo op: accessed as `kojo.ops.updateTags(id, tags)`.
 * Tags are stored as a JSON array string in the database.
 *
 * The returned row carries a `tagCount` field with the total number of
 * distinct tags across all visible media, so the client can update the
 * sidebar count without an extra request.
 */

export default function (id, tags) {
  const [kojo, logger] = this;
  const db = kojo.get('db');

  logger.debug(`[updateTags] id=${id} tags=${JSON.stringify(tags)}`);

  const result = db.prepare(
    "UPDATE media SET tags = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(JSON.stringify(tags), Number(id));

  if (result.changes === 0) {
    logger.debug(`[updateTags] not found: id=${id}`);
    return null;
  }

  logger.debug(`[updateTags] updated: id=${id}`);
  const media = db.prepare('SELECT * FROM media WHERE id = ?').get(Number(id));
  media.tags = JSON.parse(media.tags || '[]');

  const { total } = db.prepare(
    `SELECT COUNT(DISTINCT je.value) AS total
     FROM media m, json_each(m.tags) je
     WHERE m.hidden = 0`
  ).get();
  media.tagCount = total;

  logger.debug(`[updateTags] updated: id=${id} tagCount=${total}`);
  return media;
}
