/**
 * @file Get count of memory game tickets in inventory.
 *
 * Kojo op: accessed as `kojo.ops.getMemoryTickets()`.
 * Must use `function()` syntax (not arrow) to receive kojo context via `this`.
 *
 * @returns {{ tickets: number }}
 */

import { CARD_TYPE } from '@photo-quest/shared';

export default function () {
  const [kojo] = this;
  const db = kojo.get('db');

  const { tickets } = db.prepare(
    'SELECT COUNT(*) AS tickets FROM inventory WHERE card_type = ?'
  ).get(CARD_TYPE.MEMORY_TICKET);

  return { tickets };
}
