/**
 * @file PATCH /media/:id/like -- Increment the like count for a media item.
 *
 * Kojo endpoint: registers route via the addHttpRoute op.
 * Delegates to `kojo.ops.likeMedia(id)` which increments the like count
 * and persists the change to disk.
 *
 * Returns the updated media record with the new like count.
 */

import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'PATCH',
    pathname: '/media/:id/like',
  }, (req, res, params) => {
    const result = kojo.ops.likeMedia(Number(params.id));

    if (!result) {
      return json(res, 404, { error: 'Media not found' });
    }

    json(res, 200, result);
  });
};
