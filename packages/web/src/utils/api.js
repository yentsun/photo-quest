/**
 * @file API fetch wrappers for server endpoints.
 *
 * Read functions (fetchMedia, fetchMediaById, fetchFolders) follow a
 * network-first / IDB-fallback pattern:
 *   1. Try the server.
 *   2. On success — write results to IndexedDB and return them.
 *   3. On failure — return whatever IDB has from a previous load.
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
  idbPutManyFolders,
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
 * Fetch media items — network first, IDB fallback.
 *
 * On a successful server response the results are upserted into IndexedDB so
 * future offline loads can show the same data.  On any network/server error
 * the IDB snapshot is returned instead (applying the same filters in JS).
 *
 * @param {{ limit?: number, offset?: number, folder?: string, subtree?: boolean, liked?: boolean, random?: boolean }} [opts]
 * @returns {Promise<{ items: Array, total: number }>}
 */
export async function fetchTags() {
  const response = await fetch(apiRoutes.tags);
  if (!response.ok) throw new Error('Failed to fetch tags');
  return response.json();
}

export async function fetchMedia({ limit, offset, folder, subtree, liked, random, sort, search, tag } = {}) {
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

  try {
    const response = await fetch(url, random ? { cache: 'no-store' } : undefined);
    if (!response.ok) throw new Error('Failed to fetch media');
    const data = await response.json();
    /* Warm the sync cache so return visits resolve instantly. */
    for (const item of data.items) { parseTags(item); _mediaCache.set(item.id, item); }
    if (folder != null && !random && !liked && !search && (!offset || offset === 0)) {
      _folderMediaCache.set(folder, { items: data.items, total: data.total });
    }
    /* Write to IDB in the background — don't block the caller. */
    idbPutManyMedia(data.items).catch(err => console.warn('[idb] putManyMedia failed:', err));
    return data;
  } catch (err) {
    console.warn('[api] fetchMedia falling back to IDB:', err.message);
    return idbGetMedia({ folder, subtree, liked, limit, offset, sort });
  }
}

/**
 * Fetch a single media item by ID — network first, IDB fallback.
 *
 * @param {number} id
 * @returns {Promise<Object>}
 */
export async function fetchMediaById(id) {
  try {
    const response = await fetch(`${apiRoutes.media}/${id}`, {
      headers: { 'Accept': 'application/json' },
    });
    if (!response.ok) throw new Error('Failed to fetch media item');
    const item = parseTags(await response.json());
    _mediaCache.set(item.id, item);  // warm sync cache
    idbPutMedia(item).catch(err => console.warn('[idb] putMedia failed:', err));
    return item;
  } catch (err) {
    console.warn('[api] fetchMediaById falling back to IDB:', err.message);
    const item = await idbGetMediaById(Number(id));
    if (!item) throw new Error('Media not found');
    return item;
  }
}

/**
 * Rename a media item.
 *
 * @param {number} id
 * @param {string} title
 * @returns {Promise<Object>} Updated media object
 */
export async function requestTranscode(id) {
  await fetch(`/media/${id}/transcode`, { method: 'POST' });
}

export async function updateMediaTags(id, tags) {
  const response = await fetch(`/media/${id}/tags`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags }),
  });
  if (!response.ok) throw new Error('Failed to update tags');
  const item = parseTags(await response.json());
  _mediaCache.set(item.id, item);
  idbPutMedia(item).catch(err => console.warn('[idb] putMedia (tags) failed:', err));
  return item;
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
  return item;
}

/**
 * Like a media item (increment like count).
 *
 * @param {number} id - Media ID
 * @returns {Promise<Object>} Updated media object
 */
export async function likeMedia(id) {
  const response = await fetch(`/media/${id}/like`, {
    method: 'PATCH',
  });
  if (!response.ok) {
    throw new Error('Failed to like media');
  }
  return response.json();
}

/**
 * Delete a media item from library and disk.
 *
 * @param {number} id - Media ID
 * @returns {Promise<Object>}
 */
export async function deleteMedia(id) {
  const response = await fetch(`/media/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to delete media');
  }
  return response.json();
}

/**
 * Scan a directory for media files.
 * Returns immediately with { scanId, total }. Progress is reported via SSE.
 *
 * @param {string} path - Absolute path to scan
 * @returns {Promise<{scanId: number, total: number}>}
 */
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

/**
 * Cancel an in-progress scan/import.
 *
 * @param {number} scanId - Scan ID to cancel
 * @returns {Promise<{scanId: number, status: string}>}
 */
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

/**
 * Get the URL for streaming a video.
 *
 * @param {number} id - Media ID
 * @returns {string} Stream URL
 */
export function getStreamUrl(id) {
  return `/stream/${id}`;
}

/**
 * Get the URL for an image.
 *
 * @param {number} id - Media ID
 * @returns {string} Image URL
 */
export function getImageUrl(id) {
  return `/image/${id}`;
}

/**
 * Get the thumbnail URL for any media item (first frame JPEG for videos).
 *
 * @param {number} id - Media ID
 * @returns {string} Thumbnail URL
 */
export function getThumbUrl(id) {
  return `/thumb/${id}`;
}

/**
 * Get the URL for displaying media (image or video).
 *
 * @param {Object} media - Media object with id, path, type
 * @returns {string} URL for the media
 */
export function getMediaUrl(media) {
  const isImage = media.type === MEDIA_TYPE.IMAGE;
  return isImage ? getImageUrl(media.id) : getStreamUrl(media.id);
}

/**
 * Fetch network info (local and network URLs).
 *
 * @returns {Promise<{local: string, network: string|null, ip: string|null, port: number}>}
 */
export async function fetchNetworkInfo() {
  const response = await fetch(apiRoutes.network);
  if (!response.ok) {
    throw new Error('Failed to fetch network info');
  }
  return response.json();
}

/**
 * Fetch all folders with hierarchy metadata — network first, IDB fallback.
 *
 * The server computes parentId, subtreeCounts, and previewMediaId; those
 * computed fields are stored as-is so offline reads return identical shapes.
 *
 * @returns {Promise<Object[]>}
 */
export async function fetchFolders() {
  try {
    const response = await fetch(apiRoutes.folders);
    if (!response.ok) throw new Error('Failed to fetch folders');
    const folders = await response.json();
    _foldersCache = folders;  // warm sync cache
    idbPutManyFolders(folders).catch(err => console.warn('[idb] putManyFolders failed:', err));
    return folders;
  } catch (err) {
    console.warn('[api] fetchFolders falling back to IDB:', err.message);
    return idbGetFolders();
  }
}

/**
 * Remove a folder from the library by ID.
 * Records are hidden (not deleted) so likes are preserved if re-added.
 *
 * @param {number} folderId - ID of the folder to remove
 * @returns {Promise<{folder: string, hidden: number}>}
 */
export async function removeFolder(folderId) {
  const response = await fetch(`/media/folder/${folderId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to remove folder');
  }
  return response.json();
}

/**
 * Open native file picker and return a selected .db path.
 * @returns {Promise<{path: string}|{cancelled: true}>}
 */
export async function pickLibraryFile() {
  const response = await fetch(apiRoutes.libraryPick, { method: 'POST' });
  if (!response.ok) throw new Error('Could not open file picker');
  return response.json();
}

/**
 * Connect to an existing library file. Triggers app relaunch.
 * @param {string} libraryPath
 */
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

/**
 * Download a media file to the user's device.
 *
 * @param {Object} media - Media object with id, title, type
 */
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
