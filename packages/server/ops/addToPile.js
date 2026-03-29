/**
 * @file Add cards to a pile.
 *
 * Kojo op: accessed as `kojo.ops.addToPile(pileId, inventoryIds)`.
 */

export default function (pileId, inventoryIds) {
  const [kojo] = this;
  const db = kojo.get('db');

  const stmt = db.prepare('INSERT OR IGNORE INTO pile_cards (pile_id, inventory_id) VALUES (?, ?)');
  let added = 0;
  for (const invId of inventoryIds) {
    const { changes } = stmt.run(Number(pileId), Number(invId));
    added += changes;
  }

  return { added };
}
