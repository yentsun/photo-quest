/**
 * @file API fetch wrappers for server endpoints.
 */

import { apiRoutes, MEDIA_TYPE } from '@photo-quest/shared';
import { getFileUrl } from '../services/fileSystem.js';

/**
 * Fetch all media items from the server.
 *
 * @returns {Promise<Array>} Array of media objects
 */
export async function fetchMedia() {
  const response = await fetch(apiRoutes.media);
  if (!response.ok) {
    throw new Error('Failed to fetch media');
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
 * Scan a directory for media files.
 *
 * @param {string} path - Absolute path to scan
 * @returns {Promise<{scanned: number, added: number}>}
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
 * Add media items from client-side folder scan.
 *
 * @param {string} folderId - Client-generated folder ID
 * @param {string} folderName - Display name of the folder
 * @param {Array<{name: string, path: string}>} files - Array of file info
 * @returns {Promise<{added: number}>}
 */
export async function addMedia(folderId, folderName, files) {
  const response = await fetch(apiRoutes.mediaAdd, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folderId, folderName, files }),
  });
  if (!response.ok) {
    throw new Error('Failed to add media');
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
 * Check if media is from client-side folder (File System Access API).
 * Client-scanned media has path format "folderId:relativePath".
 *
 * @param {Object} media - Media object
 * @returns {boolean}
 */
export function isClientMedia(media) {
  return media.path && media.path.includes(':') && media.path.startsWith('folder-');
}

/**
 * Get the URL for displaying media (image or video).
 * Handles both server-scanned and client-scanned media.
 *
 * @param {Object} media - Media object with id, path, type
 * @returns {Promise<string>} URL for the media (blob URL or server URL)
 */
export async function getMediaUrl(media) {
  if (isClientMedia(media)) {
    // Client-scanned media: use File System Access API
    const [folderId, relativePath] = media.path.split(':');
    return getFileUrl(folderId, relativePath);
  }

  // Server-scanned media: use server endpoints
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
 * Find a folder by name in server's configured media paths.
 * Used to enable server-side scanning for cross-device access.
 *
 * @param {string} folderName - Name of the folder to find
 * @returns {Promise<{found: boolean, path?: string, message?: string}>}
 */
export async function findFolder(folderName) {
  const response = await fetch(apiRoutes.mediaFindFolder, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folderName }),
  });
  if (!response.ok) {
    throw new Error('Failed to find folder');
  }
  return response.json();
}

/**
 * Remove a folder from the library.
 * Records are hidden (not deleted) so likes are preserved if re-added.
 *
 * @param {string} folderName - Name of the folder to remove
 * @returns {Promise<{folder: string, hidden: number}>}
 */
export async function removeFolder(folderName) {
  const response = await fetch(`/media/folder/${encodeURIComponent(folderName)}`, {
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
    // Get URL (handles both server and client media)
    const url = await getMediaUrl(media);
    const response = await fetch(url);
    const blob = await response.blob();

    // Determine file extension from path
    const isImage = media.type === MEDIA_TYPE.IMAGE;
    let ext = media.path?.match(/\.[^.]+$/)?.[0];
    if (!ext) {
      ext = isImage ? '.jpg' : '.mp4';
    }
    // For client media paths like "folder-123:path/file.jpg", extract extension
    if (media.path?.includes(':')) {
      const relativePath = media.path.split(':')[1];
      ext = relativePath?.match(/\.[^.]+$/)?.[0] || ext;
    }

    const filename = `${media.title}${ext}`;

    // Create download link
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
