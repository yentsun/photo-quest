/**
 * @file List all media records, newest first.
 *
 * Kojo op: accessed as `kojo.ops.listMedia()`.
 * Must use `function()` syntax (not arrow) to receive kojo context via `this`.
 */

export default function ({ limit, offset } = {}) {
  const [kojo] = this;
  const db = kojo.get('db');

  // Get total count for pagination metadata
  const countStmt = db.prepare('SELECT COUNT(*) AS total FROM media WHERE hidden = 0');
  countStmt.step();
  const { total } = countStmt.getAsObject();
  countStmt.free();

  let sql = 'SELECT * FROM media WHERE hidden = 0 ORDER BY created_at DESC';
  const params = [];

  if (limit != null) {
    sql += ' LIMIT ?';
    params.push(limit);
    if (offset != null) {
      sql += ' OFFSET ?';
      params.push(offset);
    }
  }

  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const items = [];

  while (stmt.step()) {
    items.push(stmt.getAsObject());
  }
  stmt.free();

  return { items, total };
}
