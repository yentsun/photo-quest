/**
 * @file Use one memory game ticket.
 *
 * Kojo op: accessed as `kojo.ops.useMemoryTicket()`.
 * Must use `function()` syntax (not arrow) to receive kojo context via `this`.
 *
 * @returns {{ tickets: number }|null} Remaining tickets, or null if none available.
 */

export default function () {
  const [kojo] = this;
  const db = kojo.get('db');

  const ticket = db.prepare(
    'SELECT id FROM memory_tickets WHERE used = 0 ORDER BY id LIMIT 1'
  ).get();

  if (!ticket) return null;

  db.prepare('UPDATE memory_tickets SET used = 1 WHERE id = ?').run(ticket.id);

  return kojo.ops.getMemoryTickets();
}
