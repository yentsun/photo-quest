/**
 * @file DELETE /media/:id/likes -- Reset the like count for a media item.
 *
 * Delegates to `kojo.ops.resetLikes(id)`. Returns the updated media record,
 * with a `likedCount` total when the reset changed the liked-item count.
 */

import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'DELETE',
    pathname: '/media/:id/likes',
  }, (req, res, params) => {
    logger.debug(`[DELETE /media/:id/likes] id=${params.id}`);
    const result = kojo.ops.resetLikes(Number(params.id));

    if (!result) {
      logger.debug(`[DELETE /media/:id/likes] not found: id=${params.id}`);
      return json(res, 404, { error: 'Media not found' });
    }

    logger.debug(`[DELETE /media/:id/likes] reset: id=${params.id} likes=${result.likes}`);
    json(res, 200, result);
  });
};
