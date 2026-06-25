/**
 * @file DELETE /media/:id -- Remove a media record and its associated jobs.
 *
 * Kojo endpoint: registers route via the addHttpRoute op.
 * Delegates to `kojo.ops.removeMedia(id)` which deletes the row and
 * persists the change to disk.
 */

import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'DELETE',
    pathname: '/media/:id',
  }, (req, res, params) => {
    logger.debug(`[DELETE /media/:id] id=${params.id}`);
    const result = kojo.ops.removeMedia(Number(params.id));

    if (!result.deleted) {
      logger.debug(`[DELETE /media/:id] not found: id=${params.id}`);
      return json(res, 404, { error: 'Media not found' });
    }

    logger.debug(`[DELETE /media/:id] deleted: id=${params.id} path=${result.path}`);
    json(res, 200, result);
  });
};
