/**
 * @file List all decks with card counts and preview.
 *
 * Kojo op: accessed as `kojo.ops.listDecks()`.
 */

export default function () {
  const [kojo] = this;
  const db = kojo.get('db');

  const rows = db.prepare(
    `SELECT d.id, d.name, d.created_at,
            (SELECT COUNT(*) FROM deck_cards dc WHERE dc.deck_id = d.id) AS cardCount,
            m.id AS preview_id, m.type AS preview_type, m.title AS preview_title
     FROM decks d
     LEFT JOIN deck_cards dc ON dc.deck_id = d.id
       AND dc.id = (
         SELECT dc2.id FROM deck_cards dc2
         JOIN inventory i ON i.id = dc2.inventory_id
         JOIN media med ON med.id = i.media_id
         WHERE dc2.deck_id = d.id
         ORDER BY dc2.id DESC LIMIT 1
       )
     LEFT JOIN inventory i ON i.id = dc.inventory_id
     LEFT JOIN media m ON m.id = i.media_id
     GROUP BY d.id
     ORDER BY d.created_at DESC`
  ).all();

  const result = rows.map(d => ({
    id: d.id,
    name: d.name,
    created_at: d.created_at,
    cardCount: d.cardCount,
    preview: d.preview_id ? { id: d.preview_id, type: d.preview_type, title: d.preview_title } : null,
  }));

  const grouped = db.prepare('SELECT DISTINCT inventory_id FROM deck_cards').all();
  const groupedIds = grouped.map(r => r.inventory_id);

  /* Denormalized membership rows so the client can render any user deck
   * (DeckPage) entirely from the local IDB replica. Each row carries the
   * joined inventory + media fields, mirroring listDeckCards. */
  const cards = db.prepare(
    `SELECT dc.deck_id, i.id AS inventory_id, i.acquired_at, m.*
     FROM deck_cards dc
     JOIN inventory i ON i.id = dc.inventory_id
     JOIN media m ON m.id = i.media_id
     ORDER BY dc.deck_id, dc.id`
  ).all();

  return { decks: result, groupedIds, cards };
}
