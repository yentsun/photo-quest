/**
 * @file Get count of unused memory game tickets.
 *
 * Kojo op: accessed as `kojo.ops.getMemoryTickets()`.
 * Must use `function()` syntax (not arrow) to receive kojo context via `this`.
 *
 * @returns {{ tickets: number }}
 */

export default function () {
  const [kojo] = this;
  const db = kojo.get('db');

  const { tickets } = db.prepare(
    'SELECT COUNT(*) AS tickets FROM memory_tickets WHERE used = 0'
  ).get();

  return { tickets };
}
