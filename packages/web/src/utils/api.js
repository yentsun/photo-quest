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
import {
  idbGetMedia,
  idbGetMediaById,
  idbGetFolders,
  idbPutMedia,
  idbPutManyMedia,
  idbDeleteMedia,
  idbDeleteFolder,
  idbReplaceFolders,
} from '../services/idb.js';

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
 * Clear all in-memory session caches (folders, tags, media, per-folder media).
 * Used after a full cache purge so the next render fetches fresh from the
 * server instead of serving stale in-memory data.
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
// Library / Liked / Tags counts are cached in-memory + localStorage so the
// badges render instantly on every load and are never recomputed by scanning
// the whole media store. They are refreshed against the cheap server COUNT
// endpoints (which return just a total) only on data-change signals.

const COUNTS_STORAGE_KEY = 'photoquest.counts-v1';
const EMPTY_COUNTS = { library: null, liked: null, tags: null };

/** @type {{ library: number|null, liked: number|null, tags: number|null }} */
let _countsCache = null;

/**
 * Return the cached badge counts (or nulls on first run / cleared storage).
 * @returns {{ library: number|null, liked: number|null, tags: number|null }}
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
 * @returns {Promise<{ library: number|null, liked: number|null, tags: number|null }>}
 */
export async function refreshCounts() {
  const [library, liked, tags] = await Promise.all([
    fetchMedia({ limit: 0 }).then(d => d.total).catch(() => null),
    fetchMedia({ liked: true, limit: 0 }).then(d => d.total).catch(() => null),
    fetchTags().then(d => d.length).catch(() => null),
  ]);
  const counts = { library, liked, tags };
  persistCounts(counts);
  return counts;
}

// ---------------------------------------------------------------------------
// Internal server fetch helpers
// ---------------------------------------------------------------------------

async function _fetchMediaFromServer(url, opts) {
  const t0 = performance.now();
  const response = await fetch(url, opts.random ? { cache: 'no-store' } : undefined);
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
  const response = await fetch(apiRoutes.folders);
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
  const response = await fetch(apiRoutes.tags);
  if (!response.ok) throw new Error('Failed to fetch tags');
  const data = await response.json();
  _tagsCache = data;
  return data;
}

export async function fetchMedia({ limit, offset, folder, subtree, liked, random, sort, search, tag, type, skipCache = false } = {}) {
  const url = new URL(apiRoutes.media, window.location.origin);
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
      // Refresh from server in background
      fetch(`${apiRoutes.media}/${id}`, { headers: { 'Accept': 'application/json' } })
        .then(async r => {
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
    const response = await fetch(`${apiRoutes.media}/${id}`, {
      headers: { 'Accept': 'application/json' },
    });
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
  await fetch(`/media/${id}/transcode`, { method: 'POST' });
}

export async function fetchJobs() {
  const response = await fetch('/jobs');
  if (!response.ok) throw new Error('Failed to fetch jobs');
  return response.json();
}

export async function pauseJobs() {
  const response = await fetch('/jobs/pause', { method: 'POST' });
  if (!response.ok) throw new Error('Failed to pause transcodes');
  return response.json();
}

export async function resumeJobs() {
  const response = await fetch('/jobs/resume', { method: 'POST' });
  if (!response.ok) throw new Error('Failed to resume transcodes');
  return response.json();
}

export async function cancelJob(id) {
  const response = await fetch(`/jobs/${id}/cancel`, { method: 'POST' });
  if (!response.ok) throw new Error('Failed to cancel job');
  return response.json();
}

export async function updateMediaTags(id, tags) {
  const response = await fetch(`/media/${id}/tags`, {
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
  const response = await fetch(`/media/${id}/title`, {
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

export async function likeMedia(id) {
  const response = await fetch(`/media/${id}/like`, {
    method: 'PATCH',
  });
  if (!response.ok) {
    throw new Error('Failed to like media');
  }
  const data = await response.json();
  const { likedCount, ...item } = data;
  _mediaCache.set(item.id, item);
  idbPutMedia(item).catch(() => {});
  /* The server returns the updated liked count (only when an item transitions
     to liked); surface it so the sidebar updates without an extra request. */
  return { item, likedCount };
}

export async function deleteMedia(id) {
  const cached = _mediaCache.get(id);
  const folderPath = cached?.folder;

  const response = await fetch(`/media/${id}`, {
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
  const response = await fetch(apiRoutes.mediaScan, {
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
  const response = await fetch(`/scans/${scanId}/cancel`, {
    method: 'POST',
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to cancel scan');
  }
  return response.json();
}

export function getStreamUrl(id) {
  return `/stream/${id}`;
}

export function getImageUrl(id) {
  return `/image/${id}`;
}

export function getThumbUrl(id, time = null) {
  if (time == null) return `/thumb/${id}`;
  return `/thumb/${id}?time=${time}`;
}

export function getMediaUrl(media) {
  const isImage = media.type === MEDIA_TYPE.IMAGE;
  return isImage ? getImageUrl(media.id) : getStreamUrl(media.id);
}

export async function fetchNetworkInfo() {
  const response = await fetch(apiRoutes.network);
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
    const response = await fetch(`/folders?parent=${parentId}`);
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
  const response = await fetch(`/folders?path=${encodeURIComponent(folderPath)}`);
  if (!response.ok) throw new Error('Failed to fetch folder chain');
  return response.json();
}

export async function removeFolder(folderId) {
  const response = await fetch(`/media/folder/${folderId}`, {
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
  const response = await fetch(`/folders/${folderId}`, {
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
  const response = await fetch(`/folders/${folderId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error('Failed to set folder thumbnail');
  return response.json();
}

export async function setVideoThumbnail(mediaId, time) {
  const response = await fetch(`/media/${mediaId}/thumbnail`, {
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

export async function pickLibraryFile() {
  const response = await fetch(apiRoutes.libraryPick, { method: 'POST' });
  if (!response.ok) throw new Error('Could not open file picker');
  return response.json();
}

export async function connectLibrary(libraryPath) {
  const response = await fetch(apiRoutes.libraryConnect, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: libraryPath }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to connect library');
  }
  return response.json();
}

export async function fetchLibraryStatus() {
  const response = await fetch(apiRoutes.libraryStatus);
  if (!response.ok) throw new Error('Failed to fetch library status');
  return response.json();
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
