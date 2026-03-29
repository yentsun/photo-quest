/**
 * @file Sell an inventory card back to the library.
 *
 * Kojo op: accessed as `kojo.ops.sellInventoryItem(inventoryId)`.
 * Must use `function()` syntax (not arrow) to receive kojo context via `this`.
 *
 * Removes from inventory, keeps media on disk. Awards infusion × 2 dust.
 *
 * @param {number} inventoryId
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

  const dustAwarded = (inv.infusion || 0) * 2;

  db.prepare('DELETE FROM inventory WHERE id = ?').run(inv.id);

  if (dustAwarded > 0) {
    kojo.ops.updateDust(dustAwarded);
  }

  const { dust } = kojo.ops.getPlayerStats();

  return { dustAwarded, dust };
}
