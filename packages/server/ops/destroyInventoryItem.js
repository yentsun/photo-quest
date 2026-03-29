/**
 * @file Destroy a media card from inventory — delete from DB/disk, award dust.
 *
 * Kojo op: accessed as `kojo.ops.destroyInventoryItem(inventoryId)`.
 * Must use `function()` syntax (not arrow) to receive kojo context via `this`.
 *
 * Awards 1 dust for non-infused media, infusion × 2 for infused media.
 * Permanently removes the media record and deletes the file from disk.
 *
 * @param {number} inventoryId - The inventory record's primary key.
 * @returns {{ dustAwarded: number, dust: number }|null} null if not found.
 */

export default function (inventoryId) {
  const [kojo] = this;
  const db = kojo.get('db');

  const inv = db.prepare(
    `SELECT i.id, i.media_id, m.infusion
     FROM inventory i JOIN media m ON m.id = i.media_id
     WHERE i.id = ?`
  ).get(Number(inventoryId));

  if (!inv) return null;

  const infusion = inv.infusion || 0;
  const dustAwarded = infusion > 0 ? infusion * 2 : 1;

  // Remove from inventory first (FK constraint)
  db.prepare('DELETE FROM inventory WHERE id = ?').run(inv.id);

  // Delete media from DB and disk
  kojo.ops.removeMedia(inv.media_id);

  // Award dust
  kojo.ops.updateDust(dustAwarded);

  const { dust } = db.prepare('SELECT dust FROM player_stats WHERE id = 1').get();

  return { dustAwarded, dust };
}
