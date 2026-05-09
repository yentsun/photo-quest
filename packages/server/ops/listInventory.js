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
           d.deck_index, d.current_position, d.exhausted, d.free_take_used,
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

  /* Attach the 8 image-pair rows to each memory ticket so the client can
   * play offline once the ticket syncs. One grouping pass beats N queries. */
  const ticketGameIds = items
    .filter(it => it.card_type === CARD_TYPE.MEMORY_TICKET && it.ref_id)
    .map(it => it.ref_id);
  if (ticketGameIds.length > 0) {
    const placeholders = ticketGameIds.map(() => '?').join(',');
    const gameCards = db.prepare(
      `SELECT mgc.game_id, m.id, m.type, m.title, m.infusion
       FROM memory_game_cards mgc
       JOIN media m ON m.id = mgc.media_id
       WHERE mgc.game_id IN (${placeholders})`
    ).all(...ticketGameIds);
    const byGame = new Map();
    for (const c of gameCards) {
      if (!byGame.has(c.game_id)) byGame.set(c.game_id, []);
      byGame.get(c.game_id).push({ id: c.id, type: c.type, title: c.title, infusion: c.infusion });
    }
    for (const it of items) {
      if (it.card_type === CARD_TYPE.MEMORY_TICKET && it.ref_id) {
        it.game_cards = byGame.get(it.ref_id) || [];
      }
    }
  }

  /* Attach each quest deck's cards (in position order) so the client can
   * open and play the deck offline once the inventory has synced. Mirrors
   * the memory-ticket pattern above. */
  const questDeckIds = items
    .filter(it => it.card_type === CARD_TYPE.QUEST_DECK && it.ref_id)
    .map(it => it.ref_id);
  if (questDeckIds.length > 0) {
    const placeholders = questDeckIds.map(() => '?').join(',');
    const deckCards = db.prepare(
      `SELECT qc.deck_id, qc.position, m.id, m.type, m.title, m.infusion
       FROM quest_cards qc
       JOIN media m ON m.id = qc.media_id
       WHERE qc.deck_id IN (${placeholders})
       ORDER BY qc.deck_id, qc.position`
    ).all(...questDeckIds);
    const byDeck = new Map();
    for (const c of deckCards) {
      if (!byDeck.has(c.deck_id)) byDeck.set(c.deck_id, []);
      byDeck.get(c.deck_id).push({ id: c.id, type: c.type, title: c.title, infusion: c.infusion });
    }
    for (const it of items) {
      if (it.card_type === CARD_TYPE.QUEST_DECK && it.ref_id) {
        it.quest_cards = byDeck.get(it.ref_id) || [];
      }
    }
  }

  return { items, total };
}
