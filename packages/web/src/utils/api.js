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
    throw new Error('Failed to cancel scan');
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
 * Fetch the player's inventory items (supports pagination).
 *
 * @param {{ limit?: number, offset?: number }} [opts]
 * @returns {Promise<{ items: Array, total: number }>}
 */
export async function fetchInventory({ limit, offset } = {}) {
  const url = new URL(apiRoutes.inventory, window.location.origin);
  if (limit != null) url.searchParams.set('limit', limit);
  if (offset != null) url.searchParams.set('offset', offset);

  const response = await fetch(url, {
    headers: { 'Accept': 'application/json' },
  });
  if (!response.ok) {
    throw new Error('Failed to fetch inventory');
  }
  return response.json();
}

/**
 * Fetch player stats (dust balance).
 *
 * @returns {Promise<{ dust: number }>}
 */
export async function fetchPlayerStats() {
  const response = await fetch(apiRoutes.player);
  if (!response.ok) throw new Error('Failed to fetch player stats');
  return response.json();
}

/**
 * Fetch today's quest decks.
 *
 * @returns {Promise<{ decks: Array, dust: number }>}
 */
export async function fetchQuestDecks() {
  const response = await fetch(apiRoutes.questDecks, {
    headers: { 'Accept': 'application/json' },
  });
  if (!response.ok) throw new Error('Failed to fetch quest decks');
  return response.json();
}

/**
 * Fetch a specific quest deck with its current card.
 *
 * @param {number} deckId
 * @returns {Promise<object>}
 */
export async function fetchQuestDeck(deckId) {
  const response = await fetch(`/quest/decks/${deckId}`, {
    headers: { 'Accept': 'application/json' },
  });
  if (!response.ok) throw new Error('Failed to fetch quest deck');
  return response.json();
}

/**
 * Advance to the next card in a quest deck.
 *
 * @param {number} deckId
 * @returns {Promise<object>}
 */
export async function advanceQuestDeck(deckId) {
  const response = await fetch(`/quest/decks/${deckId}/next`, {
    method: 'POST',
  });
  if (!response.ok) throw new Error('Failed to advance deck');
  return response.json();
}

/**
 * Spend dust to take the current card into inventory.
 *
 * @param {number} deckId
 * @returns {Promise<object>}
 */
export async function takeQuestCard(deckId) {
  const response = await fetch(`/quest/decks/${deckId}/take`, {
    method: 'POST',
  });
  if (response.status === 400) {
    const data = await response.json();
    throw new Error(data.error);
  }
  if (!response.ok) throw new Error('Failed to take card');
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
