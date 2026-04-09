/**
 * @file Add cards to a deck.
 *
 * Kojo op: accessed as `kojo.ops.addToPile(deckId, inventoryIds)`.
 */

export default function (deckId, inventoryIds) {
  const [kojo] = this;
  const db = kojo.get('db');

  const removeStmt = db.prepare('DELETE FROM deck_cards WHERE inventory_id = ? AND deck_id != ?');
  const insertStmt = db.prepare('INSERT OR IGNORE INTO deck_cards (deck_id, inventory_id) VALUES (?, ?)');
  const infuseStmt = db.prepare(`
    UPDATE media SET infusion = infusion + 10
    WHERE id = (SELECT media_id FROM inventory WHERE id = ?)
  `);
  let added = 0;
  for (const invId of inventoryIds) {
    removeStmt.run(Number(invId), Number(deckId));
    const { changes } = insertStmt.run(Number(deckId), Number(invId));
    if (changes > 0) {
      infuseStmt.run(Number(invId));
      added += changes;
    }
  }

  return { added };
}
