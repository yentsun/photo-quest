/**
 * @file List media whose file is missing/unreadable or whose processing failed,
 * grouped by content hash so related records that may still be intact are shown.
 *
 * Kojo op: accessed as `kojo.ops.listFailed()`.
 *
 * IMPORTANT: unlike `listDuplicates`, this op must stat every visible file on
 * disk, which is a synchronous sweep. The fully built result is therefore cached
 * in-process for a short TTL, keyed by the database instance. `refresh: true`
 * bypasses the cache (used by the page's manual "Re-check" action).
 *
 * `countOnly` returns just the totals for the sidebar badge. The full listing is
 * paginated by group with `limit` / `offset` and always returns the effective
 * totals so the client can drive a "load more" loop.
 *
 * @param {{ countOnly?: boolean, limit?: number, offset?: number, refresh?: boolean }} [opts]
 * @returns {Object}
 *   When countOnly: { groupCount, failedCount }
 *   Otherwise:      { groups, groupCount, failedCount }
 */

import { scanFailedMedia } from '../src/mediaHealth.js';

const CACHE_TTL_MS = 30_000;

/** @type {{ db: Object, at: number, value: Object }|null} */
let _cache = null;

function build(db) {
  const { rows, failed } = scanFailedMedia(db);

  /* Index every visible row by hash so a broken record can be shown alongside
     the copies sharing its hash (the copies that may still be intact). */
  const byHash = new Map();
  for (const row of rows) {
    if (!row.hash) continue;
    const list = byHash.get(row.hash);
    if (list) list.push(row);
    else byHash.set(row.hash, [row]);
  }

  const failedByHash = new Map();
  const solo = [];
  for (const entry of failed) {
    const siblings = entry.row.hash ? byHash.get(entry.row.hash) : null;
    if (siblings && siblings.length > 1) {
      const list = failedByHash.get(entry.row.hash);
      if (list) list.push(entry);
      else failedByHash.set(entry.row.hash, [entry]);
    } else {
      solo.push(entry);
    }
  }

  const groups = [];

  for (const [hash, entries] of failedByHash) {
    const failedIds = entries.map(entry => entry.row.id);
    const failedIdSet = new Set(failedIds);
    const reasonById = new Map(entries.map(entry => [entry.row.id, entry.reason]));
    const items = byHash.get(hash)
      .slice()
      .sort((a, b) => Number(failedIdSet.has(b.id)) - Number(failedIdSet.has(a.id)))
      .map(row => ({ ...row, health: reasonById.get(row.id) ?? null }));
    groups.push({
      key: `hash:${hash}`,
      hash,
      failedIds,
      failedCount: failedIds.length,
      siblingCount: items.length - failedIds.length,
      items,
    });
  }

  for (const entry of solo) {
    groups.push({
      key: `id:${String(entry.row.id).padStart(12, '0')}`,
      hash: null,
      failedIds: [entry.row.id],
      failedCount: 1,
      siblingCount: 0,
      items: [{ ...entry.row, health: entry.reason }],
    });
  }

  groups.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const failedCount = groups.reduce((sum, group) => sum + group.failedCount, 0);
  return { groups, groupCount: groups.length, failedCount };
}

function getResult(db, refresh) {
  const now = Date.now();
  if (!refresh && _cache && _cache.db === db && now - _cache.at < CACHE_TTL_MS) {
    return _cache.value;
  }
  const value = build(db);
  _cache = { db, at: now, value };
  return value;
}

/**
 * Drop the cached file-health sweep. Called by ops that change media state
 * (repair, delete, scan) so the next `listFailed` / `/failed?count=1` reflects
 * the change immediately instead of serving a stale result until the TTL.
 */
export function invalidateFailedCache() {
  _cache = null;
}

export default function ({ countOnly = false, limit, offset, refresh = false } = {}) {
  const [kojo, logger] = this;
  const db = kojo.get('db');

  const { groups, groupCount, failedCount } = getResult(db, refresh);

  logger.debug(`[listFailed] groupCount=${groupCount} failedCount=${failedCount} countOnly=${countOnly} limit=${limit} offset=${offset} refresh=${refresh}`);

  if (countOnly) {
    return { groupCount, failedCount };
  }

  const safeLimit = limit != null && limit > 0 ? Math.min(limit, 1000) : 25;
  const safeOffset = offset != null && offset >= 0 ? offset : 0;

  return {
    groups: groups.slice(safeOffset, safeOffset + safeLimit),
    groupCount,
    failedCount,
  };
}
