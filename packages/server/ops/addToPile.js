/**
 * @file Add cards to a deck.
 *
 * Kojo op: accessed as `kojo.ops.addToPile(deckId, inventoryIds)`.
 */

export default function (deckId, inventoryIds) {
  const [kojo] = this;
  const db = kojo.get('db');

  const stmt = db.prepare('INSERT OR IGNORE INTO deck_cards (deck_id, inventory_id) VALUES (?, ?)');
  let added = 0;
  for (const invId of inventoryIds) {
    const { changes } = stmt.run(Number(deckId), Number(invId));
    added += changes;
  }

  return { added };
}
