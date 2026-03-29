/**
 * @file PATCH /media/:id/free-infuse -- Infuse without spending dust (passive viewing).
 *
 * Kojo endpoint: registers route via the addHttpRoute op.
 * Body (optional): { amount: number } — defaults to 1.
 */

import { json, parseBody } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'PATCH',
    pathname: '/media/:id/free-infuse',
  }, async (req, res, params) => {
    const body = await parseBody(req);
    const amount = body?.amount ? Number(body.amount) : 1;

    const result = kojo.ops.freeInfuseMedia(Number(params.id), amount);

    if (!result) {
      return json(res, 404, { error: 'Media not found' });
    }

    json(res, 200, result);
  });
};
