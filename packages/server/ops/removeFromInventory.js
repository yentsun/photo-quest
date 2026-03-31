/**
 * @file Remove an item from the player's inventory.
 *
 * Kojo op: accessed as `kojo.ops.removeFromInventory(id)`.
 * Must use `function()` syntax (not arrow) to receive kojo context via `this`.
 *
 * @param {number} id - The inventory record's primary key.
 * @returns {boolean} true if deleted, false if not found.
 */

export default function (id) {
  const [kojo] = this;
  const db = kojo.get('db');

  const result = db.prepare('DELETE FROM inventory WHERE id = ?').run(Number(id));

  return result.changes > 0;
}
