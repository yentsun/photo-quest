/**
 * @file List media items in the player's inventory.
 *
 * Kojo op: accessed as `kojo.ops.listInventory({ limit, offset })`.
 * Must use `function()` syntax (not arrow) to receive kojo context via `this`.
 *
 * @param {{ limit?: number, offset?: number }} [opts]
 * @returns {{ items: object[], total: number }}
 */

export default function ({ limit, offset } = {}) {
  const [kojo] = this;
  const db = kojo.get('db');

  const { total } = db.prepare(
    'SELECT COUNT(*) AS total FROM inventory'
  ).get();

  let sql = `
    SELECT i.id AS inventory_id, i.acquired_at, m.*
    FROM inventory i
    JOIN media m ON m.id = i.media_id
    ORDER BY i.acquired_at DESC
  `;
  const params = [];

  if (limit != null) {
    sql += ' LIMIT ?';
    params.push(limit);
    if (offset != null) {
      sql += ' OFFSET ?';
      params.push(offset);
    }
  }

  const items = db.prepare(sql).all(...params);

  return { items, total };
}
