/**
 * @file Create a deck with initial cards.
 *
 * Kojo op: accessed as `kojo.ops.createDeck(name, inventoryIds, parentId)`.
 * `parentId` (optional) makes the new deck a child of an existing one;
 * a deck has at most one parent (tree, not DAG).
 */

export default function (name, inventoryIds = [], parentId = null) {
  const [kojo] = this;
  const db = kojo.get('db');

  const result = db.prepare(
    'INSERT INTO decks (name, parent_id) VALUES (?, ?)'
  ).run(name || 'New Deck', parentId == null ? null : Number(parentId));
  const deckId = Number(result.lastInsertRowid);

  if (inventoryIds.length > 0) {
    kojo.ops.addToDeck(deckId, inventoryIds);
  }

  return {
    id:        deckId,
    name:      name || 'New Deck',
    parent_id: parentId == null ? null : Number(parentId),
    cardCount: inventoryIds.length,
  };
}
