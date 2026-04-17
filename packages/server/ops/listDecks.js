/**
 * @file List all decks with card counts plus the denormalized membership rows.
 *
 * The client picks the preview from its local replica (most recent card by
 * `deck_card_id`); the server only stores, it doesn't choose.
 *
 * Kojo op: accessed as `kojo.ops.listDecks()`.
 */

export default function () {
  const [kojo] = this;
  const db = kojo.get('db');

  const decks = db.prepare(
    `SELECT d.id, d.name, d.created_at,
            (SELECT COUNT(*) FROM deck_cards dc WHERE dc.deck_id = d.id) AS cardCount
     FROM decks d
     ORDER BY d.created_at DESC`
  ).all();

  const grouped = db.prepare('SELECT DISTINCT inventory_id FROM deck_cards').all();
  const groupedIds = grouped.map(r => r.inventory_id);

  /* Denormalized membership rows so the client can render any user deck
   * (DeckPage) entirely from the local IDB replica. Each row carries the
   * joined inventory + media fields, mirroring listDeckCards. `deck_card_id`
   * is dc.id — the client uses it to pick the most-recent-first preview. */
  const cards = db.prepare(
    `SELECT dc.id AS deck_card_id, dc.deck_id, i.id AS inventory_id, i.acquired_at, m.*
     FROM deck_cards dc
     JOIN inventory i ON i.id = dc.inventory_id
     JOIN media m ON m.id = i.media_id
     ORDER BY dc.deck_id, dc.id`
  ).all();

  return { decks, groupedIds, cards };
}
