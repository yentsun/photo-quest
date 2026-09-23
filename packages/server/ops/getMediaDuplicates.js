/**
 * @file Find the duplicate copies of a single media item.
 *
 * Kojo op: accessed as `kojo.ops.getMediaDuplicates(id)`.
 * Returns every visible media row that shares the given item's non-null hash,
 * but only when there is more than one copy. Like `listDuplicates`, this op
 * groups purely by the stored `hash` column and never reads file contents —
 * full-content verification stays in the destructive merge/delete ops.
 *
 * Used by the media view to decide whether to offer a "merge duplicates"
 * action for the item currently on screen.
 *
 * @param {number|string} id - The media record's primary key.
 * @returns {{ hash: string|null, ids: number[], count: number, items: Object[] }}
 *   `count` is the total number of copies (including this item); 0/empty ids
 *   when the item has no hash or is not part of a duplicate group.
 */

export default function (id) {
  const [kojo, logger] = this;
  const db = kojo.get('db');

  const mediaId = Number(id);
  if (!Number.isInteger(mediaId) || mediaId <= 0) return { hash: null, ids: [], count: 0, items: [] };

  const media = db.prepare('SELECT id, hash FROM media WHERE id = ? AND hidden = 0').get(mediaId);
  if (!media || !media.hash) return { hash: null, ids: [], count: 0, items: [] };

  const items = db.prepare(`
    SELECT * FROM media
    WHERE hidden = 0 AND hash = ?
    ORDER BY COALESCE(date_taken, created_at) DESC, path DESC
  `).all(media.hash);

  if (items.length < 2) return { hash: media.hash, ids: [], count: 0, items: [] };

  logger.debug(`[getMediaDuplicates] id=${mediaId} hash=${media.hash} count=${items.length}`);
  return { hash: media.hash, ids: items.map(item => item.id), count: items.length, items };
}
