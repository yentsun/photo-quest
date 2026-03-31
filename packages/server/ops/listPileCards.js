/**
 * @file List cards in a deck (joined with inventory + media).
 *
 * Kojo op: accessed as `kojo.ops.listPileCards(deckId)`.
 */

export default function (deckId) {
  const [kojo] = this;
  const db = kojo.get('db');

  return db.prepare(
    `SELECT i.id AS inventory_id, i.acquired_at, m.*
     FROM deck_cards dc
     JOIN inventory i ON i.id = dc.inventory_id
     JOIN media m ON m.id = i.media_id
     WHERE dc.deck_id = ?
     ORDER BY dc.id`
  ).all(Number(deckId));
}
