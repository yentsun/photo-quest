/**
 * @file Folder aggregate cache.
 *
 * The full `/folders` response requires two GROUP BY scans over every media
 * row (counts by folder+type, and latest preview per folder). On large
 * libraries those take ~1s each and re-run on every dashboard load.
 *
 * This module caches the aggregated counts/previews and invalidates when the
 * media table changes, keyed on a cheap fingerprint (visible row count +
 * MAX(id)). Reads are O(1); recompute only happens when data actually changed.
 */

let cached = null;
let cachedKey = null;

/** Compute a cheap fingerprint of visible media — O(1) indexed lookups.
 *  Counts/previews only change on insert/delete/hide, so (count, MAX(id))
 *  precisely tracks them. */
function fingerprint(db) {
  const { c, i } = db.prepare(
    'SELECT COUNT(*) AS c, MAX(id) AS i FROM media WHERE hidden = 0'
  ).get();
  return `${c}:${i}`;
}
/**
 * Get (and lazily recompute) the folder aggregates for the full /folders
 * query. Returns { typeCounts, previews } as raw rows.
 */
export function getFolderAggregates(db) {
  const key = fingerprint(db);
  if (cached && cachedKey === key) return cached;
  const t0 = performance.now();

  const typeCounts = db.prepare(
    'SELECT folder, type, COUNT(*) as count FROM media WHERE hidden = 0 GROUP BY folder, type'
  ).all();

  const previews = db.prepare(
    'SELECT folder, MAX(id) as id FROM media WHERE hidden = 0 GROUP BY folder'
  ).all();

  cached = { typeCounts, previews };
  cachedKey = key;
  console.log(`[DBG][folderCache] RECOMPUTE ${(performance.now() - t0).toFixed(0)}ms typeCounts=${typeCounts.length} previews=${previews.length}`);
  return cached;
}

/** Drop the cache (e.g. after a scan/delete/like/tag change). */
export function invalidateFolderCache() {
  cached = null;
  cachedKey = null;
}
