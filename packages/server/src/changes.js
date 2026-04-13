/**
 * @file Server-Sent Events channel for "table changed" invalidation.
 *
 * Separate from src/sse.js (which is scoped to job progress). Clients
 * open GET /changes/events and receive JSON lines like:
 *   data: { "table": "inventory", "version": 42 }
 *
 * Consumers use each event as a "delta now" trigger.
 */

const clients = new Set();
const versions = Object.create(null);

export function addChangeClient(res) {
  clients.add(res);
  /* Send the current version of each table so a reconnecting client can
   * decide if it already has the latest state. */
  const snapshot = { type: 'snapshot', versions: { ...versions } };
  res.write(`data: ${JSON.stringify(snapshot)}\n\n`);
}

export function removeChangeClient(res) {
  clients.delete(res);
}

export function bumpTableVersion(table) {
  versions[table] = (versions[table] || 0) + 1;
  const payload = `data: ${JSON.stringify({ table, version: versions[table] })}\n\n`;
  for (const c of clients) c.write(payload);
  return versions[table];
}

export function destroyAllChangeClients() {
  for (const c of clients) { c.end(); c.destroy(); }
  clients.clear();
}
