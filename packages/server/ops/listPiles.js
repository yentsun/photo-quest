/**
 * @file List all piles with card counts.
 *
 * Kojo op: accessed as `kojo.ops.listPiles()`.
 */

export default function () {
  const [kojo] = this;
  const db = kojo.get('db');

  const piles = db.prepare(
    `SELECT p.id, p.name, p.created_at, COUNT(pc.id) AS cardCount
     FROM piles p
     LEFT JOIN pile_cards pc ON pc.pile_id = p.id
     GROUP BY p.id
     ORDER BY p.created_at DESC`
  ).all();

  /* Attach top card preview for each pile */
  const previewStmt = db.prepare(
    `SELECT m.id, m.type, m.title FROM pile_cards pc
     JOIN inventory i ON i.id = pc.inventory_id
     JOIN media m ON m.id = i.media_id
     WHERE pc.pile_id = ? ORDER BY pc.id LIMIT 1`
  );
  for (const pile of piles) {
    pile.preview = previewStmt.get(pile.id) || null;
  }

  return piles;
}
