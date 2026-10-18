/**
 * @file List all media records, newest first.
 *
 * Kojo op: accessed as `kojo.ops.listMedia()`.
 * Must use `function()` syntax (not arrow) to receive kojo context via `this`.
 */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Return the day after a `YYYY-MM-DD` date, so a `to` filter can be applied
 * as an exclusive upper bound and still include the whole day.
 *
 * @param {string} date
 * @returns {string}
 */
function nextDay(date) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

export default function ({ from, to, daysOnly, limit, offset, folder, subtree, liked, random, sort, search, tag, type } = {}) {
  const [kojo, logger] = this;
  const db = kojo.get('db');
  const tStart = performance.now();

  logger.debug(`from=${from} to=${to} daysOnly=${daysOnly} folder=${folder} subtree=${subtree} liked=${liked} random=${random} sort=${sort} search=${search} tag=${tag} type=${type} limit=${limit} offset=${offset}`);

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

  /* Timeline date range. Both bounds are inclusive `YYYY-MM-DD` days; `to`
     becomes an exclusive next-day bound so the whole end day is included.
     The COALESCE expression matches idx_media_date_sort. */
  const dateExpr = 'COALESCE(date_taken, created_at)';
  if (typeof from === 'string' && DATE_ONLY.test(from)) {
    logger.debug(`filtering from: "${from}"`);
    conditions.push(`${dateExpr} >= ?`);
    params.push(from);
  }
  if (typeof to === 'string' && DATE_ONLY.test(to)) {
    logger.debug(`filtering to: "${to}"`);
    conditions.push(`${dateExpr} < ?`);
    params.push(nextDay(to));
  }

  const where = conditions.join(' AND ');
  logger.debug(`WHERE: ${where}`);

  /* Timeline uses actual per-day totals, not just the items loaded so far.
     Group with the same filters and day key the client derives from the raw
     date (first ten characters, or "unknown"). */
  if (daysOnly) {
    const dayExpr = `CASE WHEN substr(${dateExpr}, 1, 10) GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' THEN substr(${dateExpr}, 1, 10) ELSE 'unknown' END`;
    const days = db.prepare(
      `SELECT ${dayExpr} AS day, COUNT(*) AS count FROM media WHERE ${where} GROUP BY day ORDER BY day DESC`
    ).all(...params);
    console.log(`[DBG][listMedia] DAYS ${(performance.now() - tStart).toFixed(0)}ms days=${days.length} type=${type}`);
    return { days };
  }

  const tCount = performance.now();
  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM media WHERE ${where}`).get(...params);
  console.log(`[DBG][listMedia] COUNT ${(performance.now() - tCount).toFixed(0)}ms total=${total} folder=${folder} type=${type} limit=${limit}`);

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
  console.log(`[DBG][listMedia] SELECT ${(performance.now() - tCount).toFixed(0)}ms returned=${items.length}/${total} TOTAL ${(performance.now() - tStart).toFixed(0)}ms`);

  return { items, total };
}
