/**
 * @file List all piles with card counts and preview.
 *
 * Kojo op: accessed as `kojo.ops.listPiles()`.
 */

export default function () {
  const [kojo] = this;
  const db = kojo.get('db');

  const piles = db.prepare(
    `SELECT p.id, p.name, p.created_at, COUNT(pc.id) AS cardCount,
            latest_m.id AS preview_id, latest_m.type AS preview_type, latest_m.title AS preview_title
     FROM piles p
     LEFT JOIN pile_cards pc ON pc.pile_id = p.id
     LEFT JOIN pile_cards latest_pc ON latest_pc.pile_id = p.id
       AND latest_pc.id = (SELECT MAX(pc2.id) FROM pile_cards pc2 WHERE pc2.pile_id = p.id)
     LEFT JOIN inventory latest_i ON latest_i.id = latest_pc.inventory_id
     LEFT JOIN media latest_m ON latest_m.id = latest_i.media_id
     GROUP BY p.id
     ORDER BY p.created_at DESC`
  ).all();

  const result = piles.map(p => ({
    id: p.id,
    name: p.name,
    created_at: p.created_at,
    cardCount: p.cardCount,
    preview: p.preview_id ? { id: p.preview_id, type: p.preview_type, title: p.preview_title } : null,
  }));

  const grouped = db.prepare('SELECT DISTINCT inventory_id FROM pile_cards').all();
  const groupedIds = grouped.map(r => r.inventory_id);

  return { piles: result, groupedIds };
}
