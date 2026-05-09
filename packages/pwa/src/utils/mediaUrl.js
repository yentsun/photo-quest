/**
 * @file URL helper for media served by the photo-quest server.
 *
 * Images go through /image/:id; videos go through /stream/:id (which
 * supports HTTP range so the browser can seek). For thumbnail contexts
 * pass `{ thumbnail: true }` and videos route to /image/:id too — the
 * server returns the extracted first frame as a JPEG.
 */

import { MEDIA_TYPE } from '@photo-quest/shared';

export function mediaUrl(serverUrl, item, { thumbnail = false } = {}) {
  const wantsImage = thumbnail || item.type === MEDIA_TYPE.IMAGE;
  const kind = wantsImage ? 'image' : 'stream';
  return `${serverUrl}/${kind}/${item.id}`;
}
