/**
 * @file Create a deck with initial cards.
 *
 * Kojo op: accessed as `kojo.ops.createPile(name, inventoryIds)`.
 */

export default function (name, inventoryIds = []) {
  const [kojo] = this;
  const db = kojo.get('db');

  const result = db.prepare('INSERT INTO decks (name) VALUES (?)').run(name || 'New Deck');
  const deckId = Number(result.lastInsertRowid);

  if (inventoryIds.length > 0) {
    kojo.ops.addToPile(deckId, inventoryIds);
  }

  return { id: deckId, name: name || 'New Deck', cardCount: inventoryIds.length };
}
