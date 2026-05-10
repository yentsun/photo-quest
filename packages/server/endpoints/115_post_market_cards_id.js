/**
 * @file POST /market/cards/:mediaId -- Buy a single media card from the market.
 *
 * Kojo endpoint: registers route via the addHttpRoute op.
 * Delegates to `kojo.ops.buyMarketCard(mediaId)`.
 */

import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'POST',
    pathname: '/market/cards/:mediaId',
  }, (req, res, params) => {
    const result = kojo.ops.buyMarketCard(Number(params.mediaId));

    if (!result)        return json(res, 404, { error: 'Media not found' });
    if (result.error)   return json(res, 400, { error: result.error });

    kojo.ops.bumpVersion('inventory');
    kojo.ops.bumpVersion('player');
    json(res, 201, result);
  });
};
