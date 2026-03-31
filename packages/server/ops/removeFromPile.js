/**
 * @file Remove a card from a deck.
 *
 * Kojo op: accessed as `kojo.ops.removeFromPile(deckId, inventoryId)`.
 */

export default function (deckId, inventoryId) {
  const [kojo] = this;
  const db = kojo.get('db');

  const { changes } = db.prepare(
    'DELETE FROM deck_cards WHERE deck_id = ? AND inventory_id = ?'
  ).run(Number(deckId), Number(inventoryId));

  return changes > 0;
}
