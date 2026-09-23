/**
 * @file GET /media/:id/duplicates -- Return the duplicate copies of one item.
 *
 * Used by the single-media view to show a "merge duplicates" action only when
 * the item currently on screen shares its content hash with other records.
 * Returns `{ hash, ids, count, items }`; `count` is 0 and `ids` empty when the
 * item has no duplicates.
 */

import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'GET',
    pathname: '/media/:id/duplicates',
  }, (req, res, params) => {
    logger.debug(`[GET /media/:id/duplicates] id=${params.id}`);
    const result = kojo.ops.getMediaDuplicates(Number(params.id));
    json(res, 200, result);
  });
};
