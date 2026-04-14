/**
 * @file List cards in a deck (joined with inventory + media).
 *
 * Kojo op: accessed as `kojo.ops.listDeckCards(deckId)`.
 */

export default function (deckId) {
  const [kojo] = this;
  const db = kojo.get('db');
  const id = Number(deckId);

  const deck = db.prepare('SELECT name FROM decks WHERE id = ?').get(id);

  const cards = db.prepare(
    `SELECT i.id AS inventory_id, i.acquired_at, m.*
     FROM deck_cards dc
     JOIN inventory i ON i.id = dc.inventory_id
     JOIN media m ON m.id = i.media_id
     WHERE dc.deck_id = ?
     ORDER BY dc.id`
  ).all(id);

  return { name: deck?.name || 'Deck', cards };
}
