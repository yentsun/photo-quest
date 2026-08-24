/**
 * @file List all media records, newest first.
 *
 * Kojo op: accessed as `kojo.ops.listMedia()`.
 * Must use `function()` syntax (not arrow) to receive kojo context via `this`.
 */

export default function ({ limit, offset, folder, subtree, liked, random, sort, search, tag, type } = {}) {
  const [kojo, logger] = this;
  const db = kojo.get('db');

  logger.debug(`folder=${folder} subtree=${subtree} liked=${liked} random=${random} sort=${sort} search=${search} tag=${tag} type=${type} limit=${limit} offset=${offset}`);

  const conditions = ['hidden = 0'];
  const params = [];

  if (folder != null) {
    if (subtree) {
      logger.debug(`filtering by subtree of: ${folder}`);
      conditions.push('(folder = ? OR folder LIKE ? OR folder LIKE ?)');
      params.push(folder, folder + '/%', folder + '\\%');
    } else {
      logger.debug(`filtering by exact folder: ${folder}`);
      conditions.push('folder = ?');
      params.push(folder);
    }
  }

  if (liked) {
    logger.debug(`filtering liked only`);
    conditions.push('likes > 0');
  }

  if (search != null && search.trim() !== '') {
    logger.debug(`filtering by search: "${search.trim()}"`);
    conditions.push('unicode_lower(title) LIKE unicode_lower(?)');
    params.push(`%${search.trim()}%`);
  }

  if (tag != null) {
    logger.debug(`filtering by tag: "${tag}"`);
    conditions.push("EXISTS (SELECT 1 FROM json_each(media.tags) WHERE value = ?)");
    params.push(tag);
  }

  if (type != null) {
    logger.debug(`filtering by type: "${type}"`);
    conditions.push('type = ?');
    params.push(type);
  }

  const where = conditions.join(' AND ');
  logger.debug(`WHERE: ${where}`);

  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM media WHERE ${where}`).get(...params);
  logger.debug(`total matching: ${total}`);

  const orderBy = random ? 'RANDOM()' : sort === 'none' ? 'id ASC' : sort === 'filename' ? 'path ASC' : sort === 'likes' ? 'likes DESC, COALESCE(date_taken, created_at) DESC' : liked ? 'likes DESC' : 'COALESCE(date_taken, created_at) DESC, path DESC';
  logger.debug(`orderBy: ${orderBy}`);
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

  const items = db.prepare(sql).all(...queryParams);
  logger.debug(`returned ${items.length} items`);

  return { items, total };
}
