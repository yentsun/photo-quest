/**
 * @file Buy a memory game ticket (stored as inventory card).
 *
 * Kojo op: accessed as `kojo.ops.buyMemoryTicket()`.
 * Must use `function()` syntax (not arrow) to receive kojo context via `this`.
 *
 * @returns {{ tickets: number, dust: number }|null} null if insufficient dust.
 */

import { MARKET_PRICES, CARD_TYPE } from '@photo-quest/shared';

export default function () {
  const [kojo] = this;
  const db = kojo.get('db');

  const dustResult = kojo.ops.updateDust(-MARKET_PRICES.memoryTicket);
  if (!dustResult) return null;

  db.prepare('INSERT INTO inventory (card_type) VALUES (?)').run(CARD_TYPE.MEMORY_TICKET);

  const { tickets } = kojo.ops.getMemoryTickets();

  return { tickets, dust: dustResult.dust };
}
