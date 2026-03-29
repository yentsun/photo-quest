/**
 * @file Create a pile with initial cards.
 *
 * Kojo op: accessed as `kojo.ops.createPile(name, inventoryIds)`.
 */

export default function (name, inventoryIds = []) {
  const [kojo] = this;
  const db = kojo.get('db');

  const result = db.prepare('INSERT INTO piles (name) VALUES (?)').run(name || 'New Pile');
  const pileId = Number(result.lastInsertRowid);

  const stmt = db.prepare('INSERT OR IGNORE INTO pile_cards (pile_id, inventory_id) VALUES (?, ?)');
  for (const invId of inventoryIds) {
    stmt.run(pileId, Number(invId));
  }

  return { id: pileId, name: name || 'New Pile', cardCount: inventoryIds.length };
}
