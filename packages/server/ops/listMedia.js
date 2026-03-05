/**
 * @file List all media records, newest first.
 *
 * Kojo op: accessed as `kojo.ops.listMedia()`.
 * Must use `function()` syntax (not arrow) to receive kojo context via `this`.
 */

export default function () {
  const [kojo] = this;
  const db = kojo.get('db');

  const stmt = db.prepare('SELECT * FROM media WHERE hidden = 0 ORDER BY created_at DESC');
  const results = [];

  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();

  return results;
}
