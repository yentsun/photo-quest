/**
 * @file API fetch wrappers for server endpoints.
 */

import { apiRoutes, MEDIA_TYPE } from '@photo-quest/shared';

/**
 * Fetch media items from the server (supports filtering and pagination).
 *
 * @param {{ limit?: number, offset?: number, folder?: string, subtree?: boolean, liked?: boolean }} [opts]
 * @returns {Promise<{ items: Array, total: number }>}
 */
export async function fetchMedia({ limit, offset, folder, subtree, liked } = {}) {
  const url = new URL(apiRoutes.media, window.location.origin);
  if (limit != null) url.searchParams.set('limit', limit);
  if (offset != null) url.searchParams.set('offset', offset);
  if (folder != null) url.searchParams.set('folder', folder);
  if (subtree) url.searchParams.set('subtree', '1');
  if (liked) url.searchParams.set('liked', '1');

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch media');
  }
  return response.json();
}

/**
 * Fetch a single media item by ID.
 *
 * @param {number} id
 * @returns {Promise<Object>}
 */
export async function fetchMediaById(id) {
  const response = await fetch(`${apiRoutes.media}/${id}`, {
    headers: { 'Accept': 'application/json' },
  });
  if (!response.ok) {
    throw new Error('Failed to fetch media item');
  }
  return response.json();
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
 * Fetch all folders with their IDs.
 *
 * @returns {Promise<Array<{id: number, path: string}>>}
 */
export async function fetchFolders() {
  const response = await fetch(apiRoutes.folders);
  if (!response.ok) {
    throw new Error('Failed to fetch folders');
  }
  return response.json();
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
