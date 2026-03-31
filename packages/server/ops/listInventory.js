/**
 * @file List items in the player's inventory (media, tickets, quest decks).
 *
 * Kojo op: accessed as `kojo.ops.listInventory({ limit, offset })`.
 * Must use `function()` syntax (not arrow) to receive kojo context via `this`.
 *
 * @param {{ limit?: number, offset?: number }} [opts]
 * @returns {{ items: object[], total: number }}
 */

import { CARD_TYPE } from '@photo-quest/shared';

export default function ({ limit, offset } = {}) {
  const [kojo] = this;
  const db = kojo.get('db');

  const { total } = db.prepare(
    'SELECT COUNT(*) AS total FROM inventory'
  ).get();

  let sql = `
    SELECT i.id AS inventory_id, i.card_type, i.ref_id, i.acquired_at,
           m.*,
           d.deck_index, d.current_position, d.exhausted,
           (SELECT COUNT(*) FROM quest_cards qc WHERE qc.deck_id = d.id) AS total_cards
    FROM inventory i
    LEFT JOIN media m ON m.id = i.media_id
    LEFT JOIN quest_decks d ON d.id = i.ref_id AND i.card_type = ?
    ORDER BY i.acquired_at DESC
  `;
  const params = [CARD_TYPE.QUEST_DECK];

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
