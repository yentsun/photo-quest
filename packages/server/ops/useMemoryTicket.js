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

  let result;
  if (inventoryId) {
    result = db.prepare(
      'DELETE FROM inventory WHERE id = ? AND card_type = ?'
    ).run(Number(inventoryId), CARD_TYPE.MEMORY_TICKET);
  } else {
    const ticket = db.prepare(
      'SELECT id FROM inventory WHERE card_type = ? ORDER BY id LIMIT 1'
    ).get(CARD_TYPE.MEMORY_TICKET);
    if (!ticket) return null;
    result = db.prepare('DELETE FROM inventory WHERE id = ?').run(ticket.id);
  }

  if (!result.changes) return null;

  return kojo.ops.getMemoryTickets();
}
