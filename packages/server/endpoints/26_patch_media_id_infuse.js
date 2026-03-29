/**
 * @file PATCH /media/:id/infuse -- Infuse a media item with 1 magic dust.
 *
 * Kojo endpoint: registers route via the addHttpRoute op.
 * Delegates to `kojo.ops.infuseMedia(id)`.
 */

import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'PATCH',
    pathname: '/media/:id/infuse',
  }, (req, res, params) => {
    const result = kojo.ops.infuseMedia(Number(params.id));

    if (!result) {
      return json(res, 400, { error: 'Media not found or insufficient magic dust' });
    }

    json(res, 200, result);
  });
};
