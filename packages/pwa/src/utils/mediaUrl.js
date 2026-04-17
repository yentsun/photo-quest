/**
 * @file URL helper for media served by the photo-quest server.
 *
 * Images go through /image/:id; videos go through /stream/:id (which
 * supports HTTP range so the browser can seek). All call sites pass the
 * same `(serverUrl, { id, type })` shape, hence one helper.
 */

import { MEDIA_TYPE } from '@photo-quest/shared';

export function mediaUrl(serverUrl, item) {
  const kind = item.type === MEDIA_TYPE.IMAGE ? 'image' : 'stream';
  return `${serverUrl}/${kind}/${item.id}`;
}
