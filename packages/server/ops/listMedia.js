/**
 * @file List all media records, newest first.
 *
 * Kojo op: accessed as `kojo.ops.listMedia()`.
 * Must use `function()` syntax (not arrow) to receive kojo context via `this`.
 */

export default function ({ limit, offset, folder, subtree, liked } = {}) {
  const [kojo] = this;
  const db = kojo.get('db');

  const conditions = ['hidden = 0'];
  const params = [];

  if (folder != null) {
    if (subtree) {
      conditions.push('(folder = ? OR folder LIKE ?)');
      params.push(folder, folder.replace(/\\/g, '/') + '/%');
    } else {
      conditions.push('folder = ?');
      params.push(folder);
    }
  }

  if (liked) {
    conditions.push('likes > 0');
  }

  const where = conditions.join(' AND ');

  // Get total count for pagination metadata
  const countStmt = db.prepare(`SELECT COUNT(*) AS total FROM media WHERE ${where}`);
  if (params.length) countStmt.bind(params);
  countStmt.step();
  const { total } = countStmt.getAsObject();
  countStmt.free();

  const orderBy = liked ? 'likes DESC' : 'created_at DESC';
  let sql = `SELECT * FROM media WHERE ${where} ORDER BY ${orderBy}`;
  const queryParams = [...params];

  if (limit != null) {
    sql += ' LIMIT ?';
    queryParams.push(limit);
    if (offset != null) {
      sql += ' OFFSET ?';
      queryParams.push(offset);
    }
  }

  const stmt = db.prepare(sql);
  if (queryParams.length) stmt.bind(queryParams);
  const items = [];

  while (stmt.step()) {
    items.push(stmt.getAsObject());
  }
  stmt.free();

  return { items, total };
}
