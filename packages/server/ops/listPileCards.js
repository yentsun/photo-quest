/**
 * @file List cards in a pile (joined with inventory + media).
 *
 * Kojo op: accessed as `kojo.ops.listPileCards(pileId)`.
 */

export default function (pileId) {
  const [kojo] = this;
  const db = kojo.get('db');

  return db.prepare(
    `SELECT i.id AS inventory_id, i.acquired_at, m.*
     FROM pile_cards pc
     JOIN inventory i ON i.id = pc.inventory_id
     JOIN media m ON m.id = i.media_id
     WHERE pc.pile_id = ?
     ORDER BY pc.id`
  ).all(Number(pileId));
}
