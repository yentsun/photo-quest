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

import { useEffect, useRef, useState } from 'react';
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
  const blobItemIdRef = useRef(null);
  const blobLoadedRef = useRef(false);

  /* Blobs are only meaningful when the consumer wants a still image.
   * For video playback the blob would be a JPEG, which a <video> can't
   * use — fall through to the network /stream/ URL instead. */
  const useBlob = thumbnail || item?.type === MEDIA_TYPE.IMAGE;

  /* When the item changes, the blob URL in state still belongs to the
   * previous item until the async loader below replaces it — and the
   * cleanup is about to revoke it. Returning that stale URL into <img>
   * makes the browser fire `onError` on a revoked blob: URL.
   * Treat the cached `blobUrl` as valid only when it belongs to the
   * currently requested item; otherwise fall through to the network URL. */
  const isBlobCurrent = blobItemIdRef.current === item?.id;

  useEffect(() => {
    if (!useBlob || !item?.id) {
      blobItemIdRef.current = null;
      blobLoadedRef.current = false;
      setBlobUrl(null);
      return;
    }
    blobLoadedRef.current = false;
    let cancelled = false;
    let createdUrl = null;

    const load = async () => {
      try {
        const row = await getMediaBlob(item.id);
        if (cancelled) return;
        if (!row?.blob) {
          blobItemIdRef.current = item.id;
          setBlobUrl(null);
          return;
        }
        const next = URL.createObjectURL(row.blob);
        if (createdUrl) URL.revokeObjectURL(createdUrl);
        createdUrl = next;
        blobItemIdRef.current = item.id;
        blobLoadedRef.current = true;
        setBlobUrl(next);
      } catch {
        if (!cancelled) {
          blobItemIdRef.current = item.id;
          setBlobUrl(null);
        }
      }
    };

    load();
    /* Re-check after sync ONLY until we've successfully loaded the blob
     * for the current item. Otherwise every emitMutation (sync-all
     * fires several — inventory, decks, player, folders, plus the
     * post-drain refetch) would call createObjectURL again, producing
     * a fresh URL string, swapping <img src>, and forcing a reload.
     * The user sees that as the loader flashing repeatedly during sync. */
    const recheck = () => { if (!blobLoadedRef.current) load(); };
    const unsub = onMutation(recheck);

    return () => {
      cancelled = true;
      unsub();
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [item?.id, useBlob]);

  if (!item) return null;
  return (isBlobCurrent && blobUrl) || mediaUrl(serverUrl, item, { thumbnail });
}
