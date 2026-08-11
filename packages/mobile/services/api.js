/**
 * @file API fetch wrappers — ported from packages/web/src/utils/api.js.
 *
 * Replaced: window.location → baseUrl helper, URL.createObjectURL → platform
 * guard, services/idb.js → services/storage.js.
 */
import { Platform } from 'react-native';
import { apiRoutes, MEDIA_TYPE } from '@photo-quest/shared';
import {
  idbGetMedia,
  idbGetMediaById,
  idbGetFolders,
  idbPutMedia,
  idbPutManyMedia,
  idbPutManyFolders,
  idbDeleteMedia,
} from './storage';
import { getApiBaseUrl } from './baseUrl';

const B = () => getApiBaseUrl();

function parseTags(item) {
  if (!item) return item;
  if (typeof item.tags === 'string') {
    try { item.tags = JSON.parse(item.tags); } catch { item.tags = []; }
  } else if (!Array.isArray(item.tags)) { item.tags = []; }
  return item;
}

/* ---------- session caches (same module-level pattern as web) ---------- */

let _foldersCache = null;
let _tagsCache = null;
const _mediaCache = new Map();
const _folderMediaCache = new Map();

export function getLastFolders() { return _foldersCache; }
export function getLastTags() { return _tagsCache; }
export function getLastMediaItem(id) { return _mediaCache.get(id) ?? null; }
export function getLastFolderMedia(folderPath) { return _folderMediaCache.get(folderPath) ?? null; }

/* ---------- internal helpers ---------- */

async function _fetchMediaFromServer(url, opts) {
  const res = await fetch(url, opts.random ? { cache: 'no-store' } : undefined);
  if (!res.ok) throw new Error('Failed to fetch media');
  const data = await res.json();
  for (const item of data.items) { parseTags(item); _mediaCache.set(item.id, item); }
  if (opts.folder != null && !opts.random && !opts.liked && !opts.search && (!opts.offset || opts.offset === 0)) {
    _folderMediaCache.set(opts.folder, { items: data.items, total: data.total });
  }
  idbPutManyMedia(data.items).catch(() => {});
  return data;
}

async function _fetchFoldersFromServer() {
  const res = await fetch(B() + apiRoutes.folders);
  if (!res.ok) throw new Error('Failed to fetch folders');
  const folders = await res.json();
  _foldersCache = folders;
  idbPutManyFolders(folders).catch(() => {});
  return folders;
}

/* ---------- public read API ---------- */

export async function fetchTags() {
  const res = await fetch(B() + apiRoutes.tags);
  if (!res.ok) throw new Error('Failed to fetch tags');
  const data = await res.json();
  _tagsCache = data;
  return data;
}

export async function fetchMedia({ limit, offset, folder, subtree, liked, random, sort, search, tag, type } = {}) {
  const base = B();
  const url = new URL(apiRoutes.media, base || 'http://localhost');
  if (!base) { url.host = ''; url.protocol = ''; } // relative when same-origin
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
  const finalUrl = base ? url.toString() : apiRoutes.media + url.search;

  if (random) return _fetchMediaFromServer(finalUrl, opts);

  let idbData = null;
  try { idbData = await idbGetMedia(opts); } catch {}
  if (idbData?.items?.length > 0) {
    _fetchMediaFromServer(finalUrl, opts).catch(() => {});
    return idbData;
  }
  try { return await _fetchMediaFromServer(finalUrl, opts); } catch (err) {
    return idbGetMedia(opts);
  }
}

export async function fetchMediaById(id, { skipCache = false } = {}) {
  const base = B();
  const url = `${base}/media/${id}`;

  if (!skipCache) {
    let idbItem = null;
    try { idbItem = await idbGetMediaById(Number(id)); } catch {}
    if (idbItem) {
      parseTags(idbItem);
      _mediaCache.set(idbItem.id, idbItem);
      fetch(url, { headers: { Accept: 'application/json' } })
        .then(async r => { if (!r.ok) return; const item = parseTags(await r.json()); _mediaCache.set(item.id, item); idbPutMedia(item).catch(() => {}); })
        .catch(() => {});
      return idbItem;
    }
  }
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('Failed to fetch media item');
    const item = parseTags(await res.json());
    _mediaCache.set(item.id, item);
    idbPutMedia(item).catch(() => {});
    return item;
  } catch (err) {
    const item = await idbGetMediaById(Number(id));
    if (!item) throw new Error('Media not found');
    return item;
  }
}

export async function fetchFolders() {
  let idbFolders = null;
  try { idbFolders = await idbGetFolders(); } catch {}
  if (idbFolders?.length > 0) {
    _foldersCache = idbFolders;
    _fetchFoldersFromServer().catch(() => {});
    return idbFolders;
  }
  try { return await _fetchFoldersFromServer(); } catch (err) {
    return idbGetFolders();
  }
}

export async function fetchFoldersForParent(parentId) {
  const res = await fetch(`${B()}/folders?parent=${parentId}`);
  if (!res.ok) throw new Error('Failed to fetch folder scope');
  return res.json();
}

export async function fetchFolderChain(folderPath) {
  const res = await fetch(`${B()}/folders?path=${encodeURIComponent(folderPath)}`);
  if (!res.ok) throw new Error('Failed to fetch folder chain');
  return res.json();
}

/* ---------- write operations ---------- */

export async function likeMedia(id) {
  const res = await fetch(`${B()}/media/${id}/like`, { method: 'PATCH' });
  if (!res.ok) throw new Error('Failed to like media');
  const item = await res.json();
  _mediaCache.set(item.id, item);
  idbPutMedia(item).catch(() => {});
  return item;
}

export async function deleteMedia(id) {
  const cached = _mediaCache.get(id);
  const folderPath = cached?.folder;
  const res = await fetch(`${B()}/media/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete media');
  const result = await res.json();
  _mediaCache.delete(id);
  if (folderPath) _folderMediaCache.delete(folderPath);
  idbDeleteMedia(id).catch(() => {});
  return result;
}

export async function scanMedia(path) {
  const res = await fetch(B() + apiRoutes.mediaScan, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) throw new Error('Failed to scan directory');
  return res.json();
}

export async function cancelScan(scanId) {
  const res = await fetch(`${B()}/scans/${scanId}/cancel`, { method: 'POST' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to cancel scan');
  }
  return res.json();
}

export async function removeFolder(folderId) {
  const res = await fetch(`${B()}/media/folder/${folderId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to remove folder');
  return res.json();
}

export async function renameFolder(folderId, name) {
  const res = await fetch(`${B()}/folders/${folderId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error('Failed to rename folder');
  return res.json();
}

export async function setFolderThumbnail(folderId, mediaId, time = null) {
  const payload = { thumbnailMediaId: mediaId };
  if (time != null) payload.thumbnailTime = time;
  const res = await fetch(`${B()}/folders/${folderId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to set folder thumbnail');
  return res.json();
}

export async function renameMedia(id, title) {
  const res = await fetch(`${B()}/media/${id}/title`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error('Failed to rename media');
  const item = await res.json();
  _mediaCache.set(item.id, item);
  idbPutMedia(item).catch(() => {});
  return item;
}

export async function updateMediaTags(id, tags) {
  const res = await fetch(`${B()}/media/${id}/tags`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags }),
  });
  if (!res.ok) throw new Error('Failed to update tags');
  const item = parseTags(await res.json());
  _mediaCache.set(item.id, item);
  _tagsCache = null;
  idbPutMedia(item).catch(() => {});
  return item;
}

export async function setVideoThumbnail(mediaId, time) {
  const res = await fetch(`${B()}/media/${mediaId}/thumbnail`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ thumbnailTime: time }),
  });
  if (!res.ok) throw new Error('Failed to set video thumbnail');
  const item = parseTags(await res.json());
  _mediaCache.set(item.id, item);
  idbPutMedia(item).catch(() => {});
  return item;
}

export async function requestTranscode(id) {
  await fetch(`${B()}/media/${id}/transcode`, { method: 'POST' });
}

/* ---------- URL builders (pure, no side effects) ---------- */

export function getStreamUrl(id)  { return `${B()}/stream/${id}`; }
export function getImageUrl(id)   { return `${B()}/image/${id}`; }
export function getThumbUrl(id, time = null) {
  return time == null ? `${B()}/thumb/${id}` : `${B()}/thumb/${id}?time=${time}`;
}
export function getMediaUrl(media) {
  const isImage = media.type === MEDIA_TYPE.IMAGE;
  return isImage ? getImageUrl(media.id) : getStreamUrl(media.id);
}

/* ---------- network / library ---------- */

export async function fetchNetworkInfo() {
  const res = await fetch(B() + apiRoutes.network);
  if (!res.ok) throw new Error('Failed to fetch network info');
  return res.json();
}

export async function pickLibraryFile() {
  const res = await fetch(B() + apiRoutes.libraryPick, { method: 'POST' });
  if (!res.ok) throw new Error('Could not open file picker');
  return res.json();
}

export async function connectLibrary(libraryPath) {
  const res = await fetch(B() + apiRoutes.libraryConnect, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: libraryPath }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to connect library');
  }
  return res.json();
}

/* ---------- download ---------- */

export async function downloadMedia(media) {
  const url = getMediaUrl(media);
  const res = await fetch(url);
  const blob = await res.blob();
  const isImage = media.type === MEDIA_TYPE.IMAGE;
  const ext = media.path?.match(/\.[^.]+$/)?.[0] || (isImage ? '.jpg' : '.mp4');
  const filename = `${media.title}${ext}`;

  if (Platform.OS === 'web') {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
  }
}
