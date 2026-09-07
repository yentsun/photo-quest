/**
 * @file List duplicate media groups, keyed by content hash.
 *
 * Kojo op: accessed as `kojo.ops.listDuplicates()`.
 * Groups visible media rows (hidden = 0) that share the same non-null hash,
 * only including hashes that appear in more than one row.
 *
 * IMPORTANT: this op must NEVER block the event loop. It does not read file
 * contents — grouping is done purely in SQL over the `hash` column. Full-content
 * verification is deliberately deferred to the destructive ops (merge / delete),
 * which already compare file bytes via `getVerifiedDuplicateGroup` before acting.
 *
 * `countOnly` is a single aggregate query (instantly cheap). The full listing is
 * paginated by hash group with `limit` / `offset` so it never materialises the
 * whole media store at once, and returns the effective totals so the client can
 * drive a "load more" loop.
 *
 * @param {{ countOnly?: boolean, limit?: number, offset?: number }} [opts]
 * @returns {Object}
 *   When countOnly:           { groupCount, copyCount }
 *   Otherwise:                { groups, groupCount, copyCount }
 */

const ORDER_HASH_GROUP = 'ORDER BY hash ASC';

export default function ({ countOnly = false, limit, offset } = {}) {
  const [kojo, logger] = this;
  const db = kojo.get('db');

  /* Total groups + extra copies across ALL hash groups (one aggregate pass). */
  const totals = db.prepare(`
    SELECT COUNT(*) AS groups, COALESCE(SUM(cnt - 1), 0) AS copies
    FROM (
      SELECT COUNT(*) AS cnt FROM media
      WHERE hidden = 0 AND hash IS NOT NULL AND hash != ''
      GROUP BY hash HAVING COUNT(*) > 1
    )
  `).get();
  const groupCount = totals.groups;
  const copyCount = totals.copies;

  logger.debug(`[listDuplicates] groupCount=${groupCount} copyCount=${copyCount} countOnly=${countOnly} limit=${limit} offset=${offset}`);

  if (countOnly) {
    return { groupCount, copyCount };
  }

  const safeLimit = limit != null && limit > 0 ? Math.min(limit, 1000) : 50;
  const safeOffset = offset != null && offset >= 0 ? offset : 0;

  /* Page of group headers (hash + size) for the requested window. */
  const headerSql = `
    SELECT hash, COUNT(*) AS count FROM media
    WHERE hidden = 0 AND hash IS NOT NULL AND hash != ''
    GROUP BY hash HAVING COUNT(*) > 1
    ${ORDER_HASH_GROUP}
    LIMIT ? OFFSET ?
  `;
  const headers = db.prepare(headerSql).all(safeLimit, safeOffset);
  if (headers.length === 0) {
    return { groups: [], groupCount, copyCount };
  }

  /* Fetch only the rows that belong to this page's groups. */
  const hashes = headers.map(h => h.hash);
  const placeholders = hashes.map(() => '?').join(', ');
  const items = db.prepare(`
    SELECT * FROM media
    WHERE hidden = 0 AND hash IN (${placeholders})
    ORDER BY hash ASC, COALESCE(date_taken, created_at) DESC, path DESC
  `).all(...hashes);

  const itemsByHash = new Map();
  for (const row of items) {
    const group = itemsByHash.get(row.hash) || [];
    group.push(row);
    itemsByHash.set(row.hash, group);
  }

  const groups = headers.map(header => {
    const groupItems = itemsByHash.get(header.hash) || [];
    return {
      hash: header.hash,
      count: groupItems.length,
      items: groupItems,
      ids: groupItems.map(item => item.id),
    };
  });

  logger.debug(`[listDuplicates] groups=${groups.length}`);
  return { groups, groupCount, copyCount };
}
