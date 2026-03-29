/**
 * @file PATCH /media/:id/infuse -- Infuse a media item with magic dust.
 *
 * Kojo endpoint: registers route via the addHttpRoute op.
 * Delegates to `kojo.ops.infuseMedia(id, amount)`.
 * Body (optional): { amount: number } — defaults to 1.
 */

import { json, parseBody } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'PATCH',
    pathname: '/media/:id/infuse',
  }, async (req, res, params) => {
    const body = await parseBody(req);
    const amount = body?.amount ? Number(body.amount) : 1;

    const result = kojo.ops.infuseMedia(Number(params.id), amount);

    if (!result) {
      return json(res, 400, { error: 'Media not found or insufficient magic dust' });
    }

    json(res, 200, result);
  });
};
