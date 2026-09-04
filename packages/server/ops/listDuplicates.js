/**
 * @file List duplicate media groups, keyed by content hash.
 *
 * Kojo op: accessed as `kojo.ops.listDuplicates()`.
 * Groups visible media rows (hidden = 0) that share the same non-null hash,
 * only including hashes that appear in more than one row.
 *
 * @param {{ countOnly?: boolean }} [opts]
 * @returns {Object}
 *   When countOnly:           { groupCount, copyCount }
 *   Otherwise:                { groups: [{ hash, count, items }] }
 */

import { findVerifiedDuplicateGroups } from './verifiedDuplicates.js';

export default function ({ countOnly = false } = {}) {
  const [kojo, logger] = this;
  const db = kojo.get('db');

  const rows = db.prepare(`
    SELECT * FROM media
    WHERE hidden = 0 AND hash IS NOT NULL AND hash != ''
      AND hash IN (
        SELECT hash FROM media
        WHERE hidden = 0 AND hash IS NOT NULL AND hash != ''
        GROUP BY hash HAVING COUNT(*) > 1
      )
    ORDER BY hash, COALESCE(date_taken, created_at) DESC, path DESC
  `).all();

  const candidatesByHash = new Map();
  for (const row of rows) {
    const group = candidatesByHash.get(row.hash) || [];
    group.push(row);
    candidatesByHash.set(row.hash, group);
  }

  const groups = [...candidatesByHash.values()]
    .flatMap(findVerifiedDuplicateGroups)
    .map(group => ({ ...group, count: group.items.length, ids: group.items.map(item => item.id) }));
  logger.debug(`[listDuplicates] groups=${groups.length}`);

  if (countOnly) {
    let copyCount = 0;
    for (const g of groups) copyCount += g.count - 1;
    logger.debug(`[listDuplicates] countOnly groups=${groups.length} copies=${copyCount}`);
    return { groupCount: groups.length, copyCount };
  }

  return { groups };
}
