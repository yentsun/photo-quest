/**
 * @file GET /media/:id -- Return a single media record by its primary key.
 *
 * Kojo endpoint: registers route via the addHttpRoute op.
 * Delegates to `kojo.ops.getMediaById(id)` for the database lookup.
 */

import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'GET',
    pathname: '/media/:id',
  }, (req, res, params) => {
    const row = kojo.ops.getMediaById(Number(params.id));

    if (!row) {
      return json(res, 404, { error: 'Media not found' });
    }

    json(res, 200, row);
  });
};
