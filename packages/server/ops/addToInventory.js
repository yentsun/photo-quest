/**
 * @file Add a media item to the player's inventory.
 *
 * Kojo op: accessed as `kojo.ops.addToInventory(mediaId)`.
 * Must use `function()` syntax (not arrow) to receive kojo context via `this`.
 *
 * Uses INSERT OR IGNORE so adding the same item twice is a no-op.
 *
 * @param {number} mediaId - The media record's primary key.
 * @returns {{ added: boolean, item: object } | null} null if media not found.
 */

export default function (mediaId) {
  const [kojo] = this;
  const db = kojo.get('db');
  const id = Number(mediaId);

  const result = db.prepare(
    'INSERT OR IGNORE INTO inventory (media_id) VALUES (?)'
  ).run(id);

  const item = db.prepare(
    `SELECT i.id AS inventory_id, i.acquired_at, m.*
     FROM inventory i JOIN media m ON m.id = i.media_id
     WHERE i.media_id = ?`
  ).get(id);

  /* FK constraint means INSERT fails silently if media doesn't exist */
  if (!item) return null;

  return { added: result.changes > 0, item };
}
