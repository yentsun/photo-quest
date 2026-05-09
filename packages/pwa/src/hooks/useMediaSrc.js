/**
 * @file useMediaSrc — resolve a media `src` from the local IDB blob store
 * if available, falling back to the server URL otherwise.
 *
 * Returning a blob: URL means the <img>/<video> renders offline. The
 * effect creates the object URL on mount and revokes it on unmount or
 * when the media id changes.
 *
 * Thumbnail mode (`{ thumbnail: true }`):
 *   - Treats both image and video media as still images. The cached blob
 *     for a video item is its first-frame JPEG (extracted server-side
 *     by /image/:id), so blobs apply to videos too. Use this for
 *     thumbnail/preview UIs.
 *
 * Default mode (playback):
 *   - Image media: use blob if cached.
 *   - Video media: skip the blob (it's a JPEG, not video bytes) and
 *     return /stream/:id directly so the <video> element gets real
 *     video data.
 */

import { useEffect, useState } from 'react';
import { MEDIA_TYPE } from '@photo-quest/shared';
import { getMediaBlob } from '../db/localDb.js';
import { onMutation } from '../db/events.js';
import { mediaUrl } from '../utils/mediaUrl.js';

/**
 * @param {string} serverUrl
 * @param {{id:number,type:string}|null} item
 * @param {{ thumbnail?: boolean }} [options]
 * @returns {string|null}
 */
export function useMediaSrc(serverUrl, item, options = {}) {
  const { thumbnail = false } = options;
  const [blobUrl, setBlobUrl] = useState(null);

  /* Blobs are only meaningful when the consumer wants a still image.
   * For video playback the blob would be a JPEG, which a <video> can't
   * use — fall through to the network /stream/ URL instead. */
  const useBlob = thumbnail || item?.type === MEDIA_TYPE.IMAGE;

  useEffect(() => {
    if (!useBlob || !item?.id) { setBlobUrl(null); return; }
    let cancelled = false;
    let createdUrl = null;

    const load = async () => {
      try {
        const row = await getMediaBlob(item.id);
        if (cancelled) return;
        if (!row?.blob) { setBlobUrl(null); return; }
        createdUrl = URL.createObjectURL(row.blob);
        setBlobUrl(createdUrl);
      } catch {
        if (!cancelled) setBlobUrl(null);
      }
    };

    load();
    /* Re-check after sync so a fresh blob flips the <img> from network to local. */
    const unsub = onMutation(load);

    return () => {
      cancelled = true;
      unsub();
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [item?.id, useBlob]);

  if (!item) return null;
  return blobUrl || mediaUrl(serverUrl, item, { thumbnail });
}
