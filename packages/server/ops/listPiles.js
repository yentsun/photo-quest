/**
 * @file List all piles with card counts.
 *
 * Kojo op: accessed as `kojo.ops.listPiles()`.
 */

export default function () {
  const [kojo] = this;
  const db = kojo.get('db');

  return db.prepare(
    `SELECT p.id, p.name, p.created_at, COUNT(pc.id) AS cardCount
     FROM piles p
     LEFT JOIN pile_cards pc ON pc.pile_id = p.id
     GROUP BY p.id
     ORDER BY p.created_at DESC`
  ).all();
}
