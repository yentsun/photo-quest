/**
 * @file API fetch wrappers for server endpoints.
 *
 * Read functions (fetchMedia, fetchMediaById, fetchFolders) follow an
 * IDB-first / background-refresh pattern:
 *   1. Return whatever IDB has immediately (instant UI).
 *   2. Fire a server request in the background to refresh the cache.
 *   3. On network/server error the IDB data is still shown.
 *
 * Write operations (like, delete, scan, …) stay server-only; they have no
 * meaningful offline equivalent.
 */

import { apiRoutes, MEDIA_TYPE } from '@photo-quest/shared';
import { resolveApiUrl, apiOrigin } from '../config/apiBase.js';
import {
  idbGetMedia,
  idbGetMediaById,
  idbGetFolders,
  idbPutMedia,
  idbPutManyMedia,
  idbDeleteMedia,
  idbDeleteFolder,
  idbReplaceFolders,
  idbPruneMedia,
} from '../services/idb.js';

/** Fetch a server URL (relative or absolute) through the configured API base. */
function apiFetch(path, opts) {
  return fetch(resolveApiUrl(path), opts);
}

// ---------------------------------------------------------------------------
// In-memory session cache
// ---------------------------------------------------------------------------
// Plain module-level variables that survive React component unmount/remount
// within the same browser session (reset only on full page reload).
//
// Used in useState() initialisers so components can resolve to real data
// synchronously — eliminating the loading flash when pressing the browser
// back button (e.g. returning from shuffle mode to Dashboard / FolderPage).
// ---------------------------------------------------------------------------

function parseTags(item) {
  if (!item) return item;
  if (typeof item.tags === 'string') {
    try { item.tags = JSON.parse(item.tags); } catch { item.tags = []; }
  } else if (!Array.isArray(item.tags)) {
    item.tags = [];
  }
  return item;
}

/** @type {Object[]|null} Last successfully fetched folder list. */
let _foldersCache = null;

/** @type {Object[]|null} Last successfully fetched tags list. */
let _tagsCache = null;

/** @type {Map<number, Object>} Last known version of each media item, keyed by id. */
const _mediaCache = new Map();

/** @type {Map<string, { items: Object[], total: number }>} Last page-1 result per folder path. */
const _folderMediaCache = new Map();

/**
 * Returns the last successfully loaded folders array, or null if not yet
 * fetched in this session.  Safe to call inside React useState initialisers
 * (synchronous — no async needed).
 *
 * @returns {Object[]|null}
 */
export function getLastFolders() { return _foldersCache; }

/**
 * Returns the last successfully loaded tags array, or null if not yet fetched.
 *
 * @returns {Object[]|null}
 */
export function getLastTags() { return _tagsCache; }

/**
 * Returns the last loaded version of a media item by its numeric id, or null
 * if this item hasn't been fetched yet in this session.
 *
 * @param {number} id
 * @returns {Object|null}
 */
export function getLastMediaItem(id) { return _mediaCache.get(id) ?? null; }

/**
 * Returns the last page-1 media result for a folder path, or null if not yet loaded.
 * @param {string} folderPath
 * @returns {{ items: Object[], total: number }|null}
 */
export function getLastFolderMedia(folderPath) { return _folderMediaCache.get(folderPath) ?? null; }

/**
 * Remove media ids from the in-memory + IDB media caches and upsert
 * replacements. Called after destructive operations (deleting or merging
 * media) so the UI reflects the change immediately, without a hard refresh.
 * Also drops stale per-folder results, folder snapshots, and the tag list,
 * which can change on merge/delete.
 *
 * @param {Array<number|string>} ids - Media ids to delete from the cache.
 * @param {Object[]} [replacements] - Media items to (re)insert into the cache.
 */
async function syncMediaCache(ids = [], replacements = []) {
  const updates = [];
  for (const id of ids) {
    _mediaCache.delete(Number(id));
    updates.push(idbDeleteMedia(id));
  }
  for (const item of replacements) {
    const parsed = parseTags(item);
    _mediaCache.set(parsed.id, parsed);
    updates.push(idbPutMedia(parsed));
  }
  _folderMediaCache.clear();
  _foldersCache = null;
  _tagsCache = null;
  updates.push(idbReplaceFolders([]));
  await Promise.all(updates.map(update => update.catch(err => {
    console.warn('[idb] cache sync failed:', err);
  })));
}

/**
 * Drop media ids from the in-memory + IndexedDB caches. Called when the server
 * reports records were removed (SSE `media_removed`) so they stop appearing in
 * grids immediately instead of lingering as dead entries.
 *
 * @param {Array<number|string>} ids
 */
export async function purgeMedia(ids = []) {
  if (!ids.length) return;
  const updates = [];
  for (const id of ids) {
    _mediaCache.delete(Number(id));
    updates.push(idbDeleteMedia(id));
  }
  _folderMediaCache.clear();
  await Promise.all(updates.map(update => update.catch(err => {
    console.warn('[idb] purge failed:', err);
  })));
}

/**
 * Fetch every visible media id from the server.
 * @returns {Promise<number[]>}
 */
export async function fetchMediaIds() {
  const url = new URL(apiRoutes.media, apiOrigin());
  url.searchParams.set('ids', '1');
  const response = await apiFetch(url);
  if (!response.ok) throw new Error('Failed to fetch media ids');
  const { ids } = await response.json();
  return ids ?? [];
}

/**
 * Reconcile the in-memory + IndexedDB media caches with the server: drop any
 * record the server no longer has. Run once per session so media deleted while
 * this client was away doesn't linger in grids.
 *
 * @returns {Promise<number>} Number of records removed.
 */
export async function pruneMediaCache() {
  const ids = await fetchMediaIds();
  const keep = new Set(ids.map(Number));
  for (const key of [..._mediaCache.keys()]) {
    if (!keep.has(key)) _mediaCache.delete(key);
  }
  return idbPruneMedia(keep);
}

/**
 * Clear all in-memory session caches (folders, tags, media, per-folder media,
 * failed listings). Used after a full cache purge so the next render fetches
 * fresh from the server instead of serving stale in-memory data.
 */
export function resetMediaCaches() {
  _foldersCache = null;
  _tagsCache = null;
  _mediaCache.clear();
  _folderMediaCache.clear();
}

// ---------------------------------------------------------------------------
// Sidebar count badges (cached — never "live" over the full library)
// ---------------------------------------------------------------------------
// Library / Liked / Tags / Duplicates counts are cached in-memory + localStorage
// so the badges render instantly on every load and are never recomputed by
// scanning the whole media store. They are refreshed against the cheap server
// COUNT endpoints (which return just a total) only on data-change signals.

const COUNTS_STORAGE_KEY = 'photoquest.counts-v2';
const EMPTY_COUNTS = { library: null, liked: null, tags: null, duplicates: null, failed: null };

/** @type {{ library: number|null, liked: number|null, tags: number|null, duplicates: number|null, failed: number|null }} */
let _countsCache = null;

/**
 * Return the cached badge counts (or nulls on first run / cleared storage).
 * @returns {{ library: number|null, liked: number|null, tags: number|null, duplicates: number|null, failed: number|null }}
 */
export function getCachedCounts() {
  if (_countsCache) return _countsCache;
  try {
    const raw = localStorage.getItem(COUNTS_STORAGE_KEY);
    _countsCache = raw ? { ...EMPTY_COUNTS, ...JSON.parse(raw) } : { ...EMPTY_COUNTS };
  } catch {
    _countsCache = { ...EMPTY_COUNTS };
  }
  return _countsCache;
}

function persistCounts(counts) {
  _countsCache = counts;
  try { localStorage.setItem(COUNTS_STORAGE_KEY, JSON.stringify(counts)); } catch { /* ignore */ }
}

/**
 * Cheaply refresh the badge counts from the server (COUNT-only requests) and
 * cache the result. Server-only; never touches the IDB snapshot.
 * @returns {Promise<{ library: number|null, liked: number|null, tags: number|null, duplicates: number|null }>}
 */
export async function refreshCounts() {
  const [library, liked, tags] = await Promise.all([
    fetchMedia({ limit: 0 }).then(d => d.total).catch(() => null),
    fetchMedia({ liked: true, limit: 0 }).then(d => d.total).catch(() => null),
    fetchTags().then(d => d.length).catch(() => null),
  ]);
  const cached = getCachedCounts();
  const counts = { library, liked, tags, duplicates: cached.duplicates, failed: cached.failed };
  persistCounts(counts);
  return counts;
}

/**
 * Refresh just the Duplicate badge count in the background. Kept separate so a
 * slow duplicate request can never delay the Library / Liked / Tags counts.
 * Timed out so a pathological server can't hang it either. The result is
 * persisted to the count cache and returned so callers can update the badge.
 *
 * @returns {Promise<number|null>}
 */
export async function refreshDuplicatesCount() {
  const duplicates = await fetchDuplicates({ countOnly: true, timeout: 8000 })
    .then(d => d.groupCount)
    .catch(() => null);
  if (duplicates != null) persistCounts({ ...getCachedCounts(), duplicates });
  return duplicates;
}

/**
 * Refresh just the Failed badge count in the background. Kept separate so a slow
 * file-health sweep can never delay the other counts. Timed out so a pathological
 * server can't hang it either.
 *
 * @returns {Promise<number|null>}
 */
export async function refreshFailedCount() {
  const failed = await fetchFailed({ countOnly: true, timeout: 8000 })
    .then(d => d.groupCount)
    .catch(() => null);
  if (failed != null) persistCounts({ ...getCachedCounts(), failed });
  return failed;
}

// ---------------------------------------------------------------------------
// Internal server fetch helpers
// ---------------------------------------------------------------------------

async function _fetchMediaFromServer(url, opts) {
  const t0 = performance.now();
  const response = await apiFetch(url, opts.random ? { cache: 'no-store' } : undefined);
  if (!response.ok) throw new Error('Failed to fetch media');
  const data = await response.json();
  const bodySize = JSON.stringify(data.items[0] ?? {}).length * data.items.length;
  console.log(`[DBG][api] SERVER /media ${(performance.now() - t0).toFixed(0)}ms items=${data.items.length} total=${data.total} est=${(bodySize / 1048576).toFixed(1)}MB folder=${opts.folder}`);
  for (const item of data.items) { parseTags(item); _mediaCache.set(item.id, item); }
  if (opts.folder != null && !opts.random && !opts.liked && !opts.search && (!opts.offset || opts.offset === 0)) {
    _folderMediaCache.set(opts.folder, { items: data.items, total: data.total });
  }
  idbPutManyMedia(data.items).catch(err => console.warn('[idb] putManyMedia failed:', err));
  return data;
}

async function _fetchFoldersFromServer() {
  const response = await apiFetch(apiRoutes.folders);
  if (!response.ok) throw new Error('Failed to fetch folders');
  const folders = await response.json();
  _foldersCache = folders;
  /* Replace (not merge) so stale folder rows from a previous connection/db
     don't survive as phantom entries in the UI. */
  idbReplaceFolders(folders).catch(err => console.warn('[idb] replaceFolders failed:', err));
  return folders;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function fetchTags() {
  const response = await apiFetch(apiRoutes.tags);
  if (!response.ok) throw new Error('Failed to fetch tags');
  const data = await response.json();
  _tagsCache = data;
  return data;
}

export async function fetchDuplicates({ countOnly = false, limit, offset, timeout } = {}) {
  const url = new URL(apiRoutes.duplicates, apiOrigin());
  if (countOnly) url.searchParams.set('count', '1');
  if (limit != null) url.searchParams.set('limit', limit);
  if (offset != null) url.searchParams.set('offset', offset);
  const opts = {};
  /* The duplicate badge must never hang the UI — if the server is slow or the
     library path is wedged, bail out rather than block rendering. */
  if (timeout != null) opts.signal = AbortSignal.timeout(timeout);
  const response = await apiFetch(url, opts);
  if (!response.ok) throw new Error('Failed to fetch duplicates');
  return response.json();
}

/**
 * Fetch media whose file is missing/unreadable or whose processing failed,
 * grouped by content hash. The server answers from its persisted health
 * snapshot, so this is cheap; `refreshing` in the response is true while a new
 * sweep runs in the background. Pass `refresh: true` to ask for a new sweep
 * (manual "Re-check").
 *
 * @param {{ countOnly?: boolean, limit?: number, offset?: number, refresh?: boolean, timeout?: number }} [opts]
 * @returns {Promise<{ groups?: Object[], groupCount: number, failedCount: number, refreshing?: boolean }>}
 */
export async function fetchFailed({ countOnly = false, limit, offset, refresh = false, timeout } = {}) {
  const url = new URL(apiRoutes.failed, apiOrigin());
  if (countOnly) url.searchParams.set('count', '1');
  if (refresh) url.searchParams.set('refresh', '1');
  if (limit != null) url.searchParams.set('limit', limit);
  if (offset != null) url.searchParams.set('offset', offset);
  const opts = {};
  if (timeout != null) opts.signal = AbortSignal.timeout(timeout);
  const response = await apiFetch(url, opts);
  if (!response.ok) throw new Error('Failed to fetch failed media');
  return response.json();
}

/**
 * Ask the server to repair failed media records by re-checking their files on
 * disk and reconciling their status. Pass `ids` for specific records or
 * `all: true` to repair every currently-failed record. `force: true` discards a
 * video's existing transcoded output and re-transcodes it from the original.
 *
 * @param {{ ids?: number[], all?: boolean, force?: boolean }} [opts]
 * @returns {Promise<{ repaired: number, restored: number, requeued: number, unrepairable: number }>}
 */
export async function repairFailed({ ids, all = false, force = false } = {}) {
  const payload = all ? { all: true } : { ids };
  if (force) payload.force = true;
  const response = await apiFetch(apiRoutes.failedRepair, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to repair media');
  }
  return response.json();
}

/**
 * Return the visible copies sharing a single media item's content hash.
 * Used by the media view to decide whether to offer a merge action.
 *
 * @param {number|string} id
 * @returns {Promise<{ hash: string|null, ids: number[], count: number, items: Object[] }>}
 */
export async function fetchMediaDuplicates(id) {
  const response = await apiFetch(`${apiRoutes.media}/${id}/duplicates`);
  if (!response.ok) throw new Error('Failed to fetch media duplicates');
  return response.json();
}

export async function mergeDuplicates({ ids, keepId }) {
  const response = await apiFetch(apiRoutes.duplicatesMerge, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(keepId != null ? { ids, keepId } : { ids }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to merge duplicates');
  }
  const data = await response.json();
  /* The master's likes/tags changed and the other copies are gone — sync the
     local caches so the change is visible without a hard refresh. */
  await syncMediaCache(data.removedIds ?? [], data.media ? [data.media] : []);
  return data;
}

export async function deleteDuplicates({ ids }) {
  const response = await apiFetch(apiRoutes.duplicatesDelete, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to delete duplicates');
  }
  const data = await response.json();
  await syncMediaCache(data.removedIds ?? [], []);
  return data;
}

export async function fetchMedia({ limit, offset, folder, subtree, liked, random, sort, search, tag, type, skipCache = false } = {}) {
  const url = new URL(apiRoutes.media, apiOrigin());
  if (limit != null) url.searchParams.set('limit', limit);
  if (offset != null) url.searchParams.set('offset', offset);
  if (folder != null) url.searchParams.set('folder', folder);
  if (subtree) url.searchParams.set('subtree', '1');
  if (liked) url.searchParams.set('liked', '1');
  if (random) url.searchParams.set('random', '1');
  if (sort != null) url.searchParams.set('sort', sort);
  if (search != null) url.searchParams.set('search', search);
  if (tag != null) url.searchParams.set('tag', tag);
  if (type != null) url.searchParams.set('type', type);

  const opts = { limit, offset, folder, subtree, liked, random, sort, search, tag, type };

  /* Random queries are always server-only. */
  if (random) {
    return _fetchMediaFromServer(url, opts);
  }

  /* Count-only queries (e.g. sidebar badges / `limit: 0`) never read the IDB
     snapshot — the full-store getAll + sort would take seconds on a large
     library. The server's COUNT is trivially fast, so go straight to it. */
  if (limit === 0) {
    return _fetchMediaFromServer(url, opts);
  }

  /* skipCache forces a fresh server fetch (e.g. for complete folder sibling
     lists), but still falls back to IDB when the server is unreachable. */
  if (skipCache) {
    try {
      return await _fetchMediaFromServer(url, opts);
    } catch (err) {
      console.warn('[api] fetchMedia falling back to IDB:', err.message);
      return idbGetMedia(opts);
    }
  }

  // IDB-first: return cached data immediately if available
  let idbData = null;
  const tIdb = performance.now();
  try {
    idbData = await idbGetMedia(opts);
  } catch (e) { /* ignore */ }
  if (idbData) console.log(`[DBG][api] fetchMedia IDB-first ${(performance.now() - tIdb).toFixed(0)}ms folder=${opts.folder} items=${idbData.items.length} total=${idbData.total}`);

  if (idbData && idbData.items.length > 0) {
    // Refresh from server in background without blocking the UI
    _fetchMediaFromServer(url, opts).catch(() => {});
    return idbData;
  }

  // No IDB data — wait for the server
  try {
    return await _fetchMediaFromServer(url, opts);
  } catch (err) {
    console.warn('[api] fetchMedia falling back to IDB:', err.message);
    return idbGetMedia(opts);
  }
}

/**
 * Drop a media item from the in-memory + IndexedDB caches. Used when the server
 * reports the record no longer exists (404) so a stale cached copy is not
 * rendered again.
 */
async function forgetMedia(id) {
  const numericId = Number(id);
  _mediaCache.delete(numericId);
  try { await idbDeleteMedia(numericId); } catch { /* ignore */ }
}

export async function fetchMediaById(id, { skipCache = false } = {}) {
  // IDB-first (unless caller needs fresh server data)
  if (!skipCache) {
    let idbItem = null;
    try {
      idbItem = await idbGetMediaById(Number(id));
    } catch (e) { /* ignore */ }

    if (idbItem) {
      parseTags(idbItem);
      _mediaCache.set(idbItem.id, idbItem);
      // Refresh from server in background. A 404 means the record is gone, so
      // purge the stale cache instead of keeping it around.
      apiFetch(`${apiRoutes.media}/${id}`, { headers: { 'Accept': 'application/json' } })
        .then(async r => {
          if (r.status === 404) { await forgetMedia(id); return; }
          if (!r.ok) return;
          const item = parseTags(await r.json());
          _mediaCache.set(item.id, item);
          idbPutMedia(item).catch(() => {});
        })
        .catch(() => {});
      return idbItem;
    }
  }

  // No IDB data — wait for the server
  try {
    const response = await apiFetch(`${apiRoutes.media}/${id}`, {
      headers: { 'Accept': 'application/json' },
    });
    if (response.status === 404) { await forgetMedia(id); return null; }
    if (!response.ok) throw new Error('Failed to fetch media item');
    const item = parseTags(await response.json());
    _mediaCache.set(item.id, item);
    idbPutMedia(item).catch(err => console.warn('[idb] putMedia failed:', err));
    return item;
  } catch (err) {
    console.warn('[api] fetchMediaById falling back to IDB:', err.message);
    const item = await idbGetMediaById(Number(id));
    if (!item) throw new Error('Media not found');
    return item;
  }
}

export async function requestTranscode(id) {
  await apiFetch(`/media/${id}/transcode`, { method: 'POST' });
}

export async function fetchJobs() {
  const response = await apiFetch('/jobs');
  if (!response.ok) throw new Error('Failed to fetch jobs');
  return response.json();
}

export async function pauseJobs() {
  const response = await apiFetch('/jobs/pause', { method: 'POST' });
  if (!response.ok) throw new Error('Failed to pause transcodes');
  return response.json();
}

export async function resumeJobs() {
  const response = await apiFetch('/jobs/resume', { method: 'POST' });
  if (!response.ok) throw new Error('Failed to resume transcodes');
  return response.json();
}

export async function cancelJob(id) {
  const response = await apiFetch(`/jobs/${id}/cancel`, { method: 'POST' });
  if (!response.ok) throw new Error('Failed to cancel job');
  return response.json();
}

export async function retryJob(id) {
  const response = await apiFetch(apiRoutes.jobRetry.replace(':id', id), { method: 'POST' });
  if (!response.ok) throw new Error('Failed to retry job');
  return response.json();
}

export async function updateMediaTags(id, tags) {
  const response = await apiFetch(`/media/${id}/tags`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags }),
  });
  if (!response.ok) throw new Error('Failed to update tags');
  const data = await response.json();
  const item = parseTags(data);
  _mediaCache.set(item.id, item);
  _tagsCache = null; // invalidate — tag counts may have changed
  idbPutMedia(item).catch(err => console.warn('[idb] putMedia (tags) failed:', err));
  /* The server returns the updated distinct tag count; surface it so the
     sidebar can update without an extra /tags request. */
  return { item, tagCount: data.tagCount };
}

export async function renameMedia(id, title) {
  const response = await apiFetch(`/media/${id}/title`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!response.ok) throw new Error('Failed to rename media');
  const item = await response.json();
  _mediaCache.set(item.id, item);
  idbPutMedia(item).catch(() => {});
  return item;
}

/**
 * How long after the last like press a "series" is considered finished. Rapid
 * presses coalesce into one request; the series ends after this quiet window.
 */
const LIKE_SERIES_MS = 400;

/** Most likes sent in one request. Hitting it flushes immediately and opens a
 *  new series, so no presses are dropped. */
const LIKE_MAX = 30;

/** @type {Map<number, { count: number, timer: any, waiters: Array<{resolve: Function, reject: Function}> }>} */
const _likeSeries = new Map();

/** Send the coalesced likes for one media item. */
async function flushLikeSeries(id) {
  const entry = _likeSeries.get(id);
  if (!entry) return;
  _likeSeries.delete(id);

  try {
    const response = await apiFetch(`/media/${id}/like?count=${entry.count}`, { method: 'PATCH' });
    if (!response.ok) throw new Error('Failed to like media');
    const data = await response.json();
    const { likedCount, ...item } = data;
    _mediaCache.set(item.id, item);
    idbPutMedia(item).catch(() => {});
    /* The server returns the updated liked count (only when an item transitions
       to liked); surface it so the sidebar updates without an extra request. */
    entry.waiters.forEach(w => w.resolve({ item, likedCount }));
  } catch (err) {
    entry.waiters.forEach(w => w.reject(err));
  }
}

/**
 * Like a media item. Consecutive calls for the same item within
 * {@link LIKE_SERIES_MS} are coalesced into a single request that adds them all,
 * so a burst of presses produces one network round-trip.
 *
 * @param {number|string} id
 * @returns {Promise<{ item: Object, likedCount?: number }>} Resolves when the
 *   series is flushed (or rejects if that request fails).
 */
export function likeMedia(id) {
  const key = Number(id);
  let entry = _likeSeries.get(key);
  if (!entry) {
    entry = { count: 0, timer: null, waiters: [] };
    _likeSeries.set(key, entry);
  }
  entry.count += 1;
  const promise = new Promise((resolve, reject) => entry.waiters.push({ resolve, reject }));
  if (entry.timer) clearTimeout(entry.timer);
  if (entry.count >= LIKE_MAX) {
    /* Cap reached — flush now instead of waiting out the quiet window. */
    entry.timer = null;
    flushLikeSeries(key);
  } else {
    entry.timer = setTimeout(() => flushLikeSeries(key), LIKE_SERIES_MS);
  }
  return promise;
}

export async function deleteMedia(id) {
  const cached = _mediaCache.get(id);
  const folderPath = cached?.folder;

  const response = await apiFetch(`/media/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to delete media');
  }
  const result = await response.json();
  _mediaCache.delete(id);
  if (folderPath) _folderMediaCache.delete(folderPath);
  idbDeleteMedia(id).catch(() => {});
  return result;
}

export async function scanMedia(path) {
  const response = await apiFetch(apiRoutes.mediaScan, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  if (!response.ok) {
    throw new Error('Failed to scan directory');
  }
  return response.json();
}

export async function cancelScan(scanId) {
  const response = await apiFetch(`/scans/${scanId}/cancel`, {
    method: 'POST',
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to cancel scan');
  }
  return response.json();
}

export function getStreamUrl(id) {
  return resolveApiUrl(`/stream/${id}`);
}

export function getImageUrl(id) {
  return resolveApiUrl(`/image/${id}`);
}

export function getThumbUrl(id, time = null) {
  if (time == null) return resolveApiUrl(`/thumb/${id}`);
  return resolveApiUrl(`/thumb/${id}?time=${time}`);
}

export function getMediaUrl(media) {
  const isImage = media.type === MEDIA_TYPE.IMAGE;
  return isImage ? getImageUrl(media.id) : getStreamUrl(media.id);
}

export async function fetchNetworkInfo() {
  const response = await apiFetch(apiRoutes.network);
  if (!response.ok) {
    throw new Error('Failed to fetch network info');
  }
  return response.json();
}

export async function fetchFolders() {
  // IDB-first: return cached folders immediately if available
  let idbFolders = null;
  try {
    idbFolders = await idbGetFolders();
  } catch (e) { /* ignore */ }

  if (idbFolders && idbFolders.length > 0) {
    _foldersCache = idbFolders;
    // Refresh from server in background without blocking the UI
    _fetchFoldersFromServer().catch(() => {});
    return idbFolders;
  }

  // No IDB data — wait for the server
  try {
    return await _fetchFoldersFromServer();
  } catch (err) {
    console.warn('[api] fetchFolders falling back to IDB:', err.message);
    return idbGetFolders();
  }
}

const _folderScopeInFlight = new Map();

export async function fetchFoldersForParent(parentId) {
  const inflight = _folderScopeInFlight.get(parentId);
  if (inflight) return inflight;

  const promise = (async () => {
    const response = await apiFetch(`/folders?parent=${parentId}`);
    if (!response.ok) throw new Error('Failed to fetch folder scope');
    return response.json();
  })();

  _folderScopeInFlight.set(parentId, promise);
  try {
    return await promise;
  } finally {
    _folderScopeInFlight.delete(parentId);
  }
}

/**
 * Fetch a folder's ancestor chain (self + parents) by path.
 * Uses the lightweight scoped folders endpoint in path mode.
 *
 * @param {string} folderPath - Absolute folder path from a media item.
 * @returns {Promise<Object[]>}
 */
export async function fetchFolderChain(folderPath) {
  const response = await apiFetch(`/folders?path=${encodeURIComponent(folderPath)}`);
  if (!response.ok) throw new Error('Failed to fetch folder chain');
  return response.json();
}

export async function removeFolder(folderId) {
  const response = await apiFetch(`/media/folder/${folderId}`, {
    method: 'DELETE',
  });
  /* 404 means the folder isn't in the connected DB (e.g. stale cache from a
     previous connection). Treat it as already removed and clear local state
     instead of surfacing an error the user can't act on. */
  if (response.status === 404) {
    _folderMediaCache.clear();
    idbDeleteFolder(folderId).catch(() => {});
    return { hidden: 0 };
  }
  if (!response.ok) {
    throw new Error('Failed to remove folder');
  }
  const result = await response.json();
  _folderMediaCache.clear();
  idbDeleteFolder(folderId).catch(() => {});
  return result;
}

export async function renameFolder(folderId, name) {
  const response = await apiFetch(`/folders/${folderId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) throw new Error('Failed to rename folder');
  return response.json();
}

export async function setFolderThumbnail(folderId, mediaId, time = null) {
  const payload = { thumbnailMediaId: mediaId };
  if (time != null) payload.thumbnailTime = time;
  const response = await apiFetch(`/folders/${folderId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error('Failed to set folder thumbnail');
  return response.json();
}

export async function setVideoThumbnail(mediaId, time) {
  const response = await apiFetch(`/media/${mediaId}/thumbnail`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ thumbnailTime: time }),
  });
  if (!response.ok) throw new Error('Failed to set video thumbnail');
  const item = parseTags(await response.json());
  _mediaCache.set(item.id, item);
  idbPutMedia(item).catch(() => {});
  return item;
}

export async function downloadMedia(media) {
  try {
    const url = getMediaUrl(media);
    const response = await fetch(url);
    const blob = await response.blob();

    const isImage = media.type === MEDIA_TYPE.IMAGE;
    const ext = media.path?.match(/\.[^.]+$/)?.[0] || (isImage ? '.jpg' : '.mp4');
    const filename = `${media.title}${ext}`;

    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
  } catch (err) {
    console.error('Download failed:', err);
    throw err;
  }
}
