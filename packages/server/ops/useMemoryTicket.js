/**
 * @file Use (consume) a memory game ticket from inventory.
 *
 * Kojo op: accessed as `kojo.ops.useMemoryTicket(inventoryId)`.
 * Must use `function()` syntax (not arrow) to receive kojo context via `this`.
 *
 * @param {number} [inventoryId] - Specific ticket to consume. If omitted, uses oldest.
 * @returns {{ tickets: number }|null} Remaining tickets, or null if none available.
 */

import { CARD_TYPE } from '@photo-quest/shared';

export default function (inventoryId) {
  const [kojo] = this;
  const db = kojo.get('db');

  const ticket = inventoryId
    ? db.prepare(
        'SELECT id, ref_id FROM inventory WHERE id = ? AND card_type = ?'
      ).get(Number(inventoryId), CARD_TYPE.MEMORY_TICKET)
    : db.prepare(
        'SELECT id, ref_id FROM inventory WHERE card_type = ? ORDER BY id LIMIT 1'
      ).get(CARD_TYPE.MEMORY_TICKET);

  if (!ticket) return null;

  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM inventory WHERE id = ?').run(ticket.id);
    if (ticket.ref_id) {
      /* Cascades to memory_game_cards via FK. */
      db.prepare('DELETE FROM memory_games WHERE id = ?').run(ticket.ref_id);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return kojo.ops.getMemoryTickets();
}
