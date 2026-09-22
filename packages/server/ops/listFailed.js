/**
 * @file List media whose file is missing/unreadable or whose processing failed,
 * grouped by content hash so related records that may still be intact are shown.
 *
 * Kojo op: accessed as `kojo.ops.listFailed()`.
 *
 * IMPORTANT: finding broken records means statting every visible media file,
 * which is far too slow to run on a request thread (tens of seconds on a large
 * library). So the sweep never runs here: it runs in the background
 * (`startHealthScan`, driven by src/mediaHealth.js) and stores its result in
 * the single-row `failed_snapshot` table. This op only reads that snapshot,
 * which makes `GET /failed` (and the sidebar count) effectively instant.
 *
 * The sweep is user-triggered: a library Refresh (ops/scanMedia.js) or an
 * explicit `refresh: true` (the Failed page's "Re-check"). Neither blocks the
 * request — the current snapshot is returned immediately with `refreshing:
 * true` while a sweep runs in the background.
 *
 * `countOnly` returns just the totals for the sidebar badge. The full listing is
 * paginated by group with `limit` / `offset` and always returns the effective
 * totals so the client can drive a "load more" loop.
 *
 * @param {{ countOnly?: boolean, limit?: number, offset?: number, refresh?: boolean }} [opts]
 * @returns {Object}
 *   When countOnly: { groupCount, failedCount, refreshing }
 *   Otherwise:      { groups, groupCount, failedCount, refreshing }
 */

import { scanFailedMediaAsync } from '../src/mediaHealth.js';

/** @type {{ groups: Object[], groupCount: number, failedCount: number, at: number }|null} */
let _snapshot = null;

/** The database instance `_snapshot` belongs to (tests open several). */
let _snapshotDb = null;

/** True while a background sweep is in flight (single-flight guard). */
let _scanning = false;

function emptySnapshot() {
  return { groups: [], groupCount: 0, failedCount: 0, at: 0 };
}

/**
 * Group broken records by content hash, alongside the copies that share the
 * hash (which may still be intact). Pure and synchronous — used by the sweep.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {Array<{ row: Object, reason: string }>} failed
 * @returns {{ groups: Object[], groupCount: number, failedCount: number }}
 */
export function buildGroups(db, failed) {
  /* Fetch the siblings of every broken record that has a hash, so a broken
     record can be shown with the copies sharing its hash. */
  const hashes = [...new Set(failed.filter(entry => entry.row.hash).map(entry => entry.row.hash))];
  const byHash = new Map();
  for (let i = 0; i < hashes.length; i += 500) {
    const chunk = hashes.slice(i, i + 500);
    const placeholders = chunk.map(() => '?').join(', ');
    const rows = db.prepare(
      `SELECT * FROM media WHERE hidden = 0 AND hash IN (${placeholders})`
    ).all(...chunk);
    for (const row of rows) {
      const list = byHash.get(row.hash);
      if (list) list.push(row);
      else byHash.set(row.hash, [row]);
    }
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

/**
 * Run the full file-health sweep and build the snapshot value. Slow — always
 * call this from the background, never from a request handler.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {object} [logger]
 * @returns {Promise<{ groups: Object[], groupCount: number, failedCount: number, at: number }>}
 */
export async function buildFailedSnapshot(db, logger = console) {
  const { failed, scanned } = await scanFailedMediaAsync(db, { logger });
  const built = buildGroups(db, failed);
  logger.debug?.(`[healthScan] ${scanned} scanned, ${built.failedCount} broken in ${built.groupCount} group(s)`);
  return { ...built, at: Date.now() };
}

/** Read the persisted snapshot (or an empty one) and cache it in memory. */
function loadSnapshot(db) {
  if (_snapshot && _snapshotDb === db) return _snapshot;
  const row = db.prepare(
    'SELECT json, group_count, failed_count, computed_at FROM failed_snapshot WHERE id = 1'
  ).get();
  if (row) {
    try {
      _snapshot = {
        groups: JSON.parse(row.json),
        groupCount: row.group_count,
        failedCount: row.failed_count,
        at: row.computed_at,
      };
    } catch {
      _snapshot = emptySnapshot();
    }
  } else {
    _snapshot = emptySnapshot();
  }
  _snapshotDb = db;
  return _snapshot;
}

/** Persist a snapshot to the single-row `failed_snapshot` table. */
function persistSnapshot(db, snapshot) {
  db.prepare(`
    INSERT INTO failed_snapshot (id, json, group_count, failed_count, computed_at)
    VALUES (1, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      json = excluded.json,
      group_count = excluded.group_count,
      failed_count = excluded.failed_count,
      computed_at = excluded.computed_at
  `).run(JSON.stringify(snapshot.groups), snapshot.groupCount, snapshot.failedCount, snapshot.at);
}

/**
 * Kick off a file-health sweep in the background. Safe to call often — a
 * second call while one is running is ignored.
 *
 * @param {object} kojo
 * @param {object} [logger]
 */
export function startHealthScan(kojo, logger = console) {
  if (_scanning) return Promise.resolve();
  _scanning = true;
  const db = kojo.get('db');
  logger.info?.('[healthScan] starting background file-health sweep...');
  return buildFailedSnapshot(db, logger)
    .then(snapshot => {
      _snapshot = snapshot;
      _snapshotDb = db;
      persistSnapshot(db, snapshot);
      logger.info?.(`[healthScan] done — ${snapshot.failedCount} broken record(s) in ${snapshot.groupCount} group(s)`);
    })
    .catch(err => logger.warn?.(`[healthScan] failed: ${err.message}`))
    .finally(() => { _scanning = false; });
}

/**
 * Return the broken media rows from the current snapshot. Used by `repairFailed`
 * so a repair-all never has to run a synchronous sweep.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {Object[]}
 */
export function getFailedMediaRows(db) {
  const snapshot = loadSnapshot(db);
  const rows = [];
  for (const group of snapshot.groups) {
    const failedSet = new Set(group.failedIds);
    for (const item of group.items) {
      if (failedSet.has(item.id)) rows.push(item);
    }
  }
  return rows;
}

/**
 * Drop the given ids from the cached snapshot after a repair or delete, so the
 * Failed section reflects the change immediately without waiting for a sweep.
 * Groups that lose all their broken records disappear; `siblingCount` is kept
 * consistent. Returns true when the snapshot changed.
 *
 * @param {object} kojo
 * @param {number[]} ids
 * @returns {boolean}
 */
export function removeFromFailedSnapshot(kojo, ids) {
  const db = kojo.get('db');
  const snapshot = loadSnapshot(db);
  const remove = new Set((ids || []).map(Number));
  if (remove.size === 0) return false;

  let changed = false;
  const groups = [];
  let failedCount = 0;
  for (const group of snapshot.groups) {
    const failedIds = group.failedIds.filter(id => !remove.has(id));
    if (failedIds.length === group.failedIds.length) {
      groups.push(group);
      failedCount += group.failedCount;
      continue;
    }
    changed = true;
    if (failedIds.length === 0) continue;
    const items = group.items.filter(item => !remove.has(item.id));
    groups.push({
      ...group,
      failedIds,
      failedCount: failedIds.length,
      siblingCount: items.length - failedIds.length,
      items,
    });
    failedCount += failedIds.length;
  }

  if (changed) {
    snapshot.groups = groups;
    snapshot.groupCount = groups.length;
    snapshot.failedCount = failedCount;
    _snapshot = snapshot;
    persistSnapshot(db, snapshot);
  }
  return changed;
}

export default function ({ countOnly = false, limit, offset, refresh = false } = {}) {
  const [kojo, logger] = this;
  const db = kojo.get('db');

  const snapshot = loadSnapshot(db);

  /* Serve the snapshot instantly; run a fresh sweep in the background only
     when explicitly asked (library Refresh or the page's "Re-check"). */
  if (refresh && !_scanning) {
    startHealthScan(kojo, logger);
  }

  logger.debug(`[listFailed] groupCount=${snapshot.groupCount} failedCount=${snapshot.failedCount} countOnly=${countOnly} limit=${limit} offset=${offset} refresh=${refresh} refreshing=${_scanning}`);

  if (countOnly) {
    return { groupCount: snapshot.groupCount, failedCount: snapshot.failedCount, refreshing: _scanning };
  }

  const safeLimit = limit != null && limit > 0 ? Math.min(limit, 1000) : 25;
  const safeOffset = offset != null && offset >= 0 ? offset : 0;

  return {
    groups: snapshot.groups.slice(safeOffset, safeOffset + safeLimit),
    groupCount: snapshot.groupCount,
    failedCount: snapshot.failedCount,
    refreshing: _scanning,
  };
}
