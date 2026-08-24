/**
 * @file Increment the like count for a media item.
 *
 * Kojo op: accessed as `kojo.ops.likeMedia(id)`.
 *
 * Likes are cumulative -- each call adds 1 to the total count.
 * There is no limit on how many times a media item can be liked.
 *
 * When a like transitions a media item from unliked (0) to liked (1),
 * the returned row carries a `likedCount` field with the new total of
 * liked items (hidden = 0 AND likes > 0) so the client can update the
 * sidebar without an extra request. Re-liking an already-liked item
 * leaves `likedCount` undefined (the total is unchanged).
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

  const newlyLiked = existing.likes === 0;

  db.prepare(
    "UPDATE media SET likes = likes + 1, updated_at = datetime('now') WHERE id = ?"
  ).run(Number(id));

  const media = db.prepare('SELECT * FROM media WHERE id = ?').get(Number(id));

  if (newlyLiked) {
    const { total } = db.prepare(
      'SELECT COUNT(*) AS total FROM media WHERE hidden = 0 AND likes > 0'
    ).get();
    media.likedCount = total;
  }

  logger.debug(`liked: id=${id} new likes=${media.likes}${newlyLiked ? ` likedCount=${media.likedCount}` : ''}`);
  return media;
}
