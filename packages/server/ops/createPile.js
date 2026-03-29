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

  if (inventoryIds.length > 0) {
    kojo.ops.addToPile(pileId, inventoryIds);
  }

  return { id: pileId, name: name || 'New Pile', cardCount: inventoryIds.length };
}
