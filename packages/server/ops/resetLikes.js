/**
 * @file Reset the like count for a media item to zero.
 *
 * Kojo op: accessed as `kojo.ops.resetLikes(id)`.
 *
 * When the item was liked, the returned row carries a `likedCount` field with
 * the new total of liked items (hidden = 0 AND likes > 0) so the client can
 * update the sidebar without an extra request. An item already at zero leaves
 * `likedCount` undefined (the total is unchanged).
 *
 * @param {number|string} id - The media record's primary key.
 * @returns {Object|null} The updated media row, or null if not found.
 */

export default function (id) {
  const [kojo, logger] = this;
  const db = kojo.get('db');

  logger.debug(`id=${id}`);

  const existing = db.prepare('SELECT likes FROM media WHERE id = ?').get(Number(id));
  if (!existing) {
    logger.debug(`not found: id=${id}`);
    return null;
  }

  const wasLiked = (existing.likes || 0) > 0;

  db.prepare(
    "UPDATE media SET likes = 0, updated_at = datetime('now') WHERE id = ?"
  ).run(Number(id));

  const media = db.prepare('SELECT * FROM media WHERE id = ?').get(Number(id));

  if (wasLiked) {
    const { total } = db.prepare(
      'SELECT COUNT(*) AS total FROM media WHERE hidden = 0 AND likes > 0'
    ).get();
    media.likedCount = total;
  }

  logger.debug(`reset: id=${id}${wasLiked ? ` likedCount=${media.likedCount}` : ''}`);
  return media;
}
