/**
 * @file PATCH /player/dust -- Add or spend magic dust.
 *
 * Kojo endpoint: registers route via the addHttpRoute op.
 * Delegates to `kojo.ops.updateDust(delta)`.
 *
 * Body: { delta: number }
 * Returns updated { dust } or 400 if insufficient balance.
 */

import { json, parseBody } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'PATCH',
    pathname: '/player/dust',
  }, async (req, res) => {
    const body = await parseBody(req);
    const delta = Number(body.delta);

    if (!Number.isFinite(delta) || delta === 0) {
      return json(res, 400, { error: 'delta must be a non-zero number' });
    }

    const result = kojo.ops.updateDust(delta);

    if (!result) {
      return json(res, 400, { error: 'Insufficient magic dust' });
    }

    kojo.ops.bumpVersion('player');
    json(res, 200, result);
  });
};
