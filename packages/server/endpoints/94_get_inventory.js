/**
 * @file GET /inventory -- List the player's inventory items.
 *
 * Kojo endpoint: registers route via the addHttpRoute op.
 * Delegates to `kojo.ops.listInventory()`.
 * Supports ?limit= and ?offset= query params for pagination.
 */

import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'GET',
    pathname: '/inventory',
  }, (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const limit = url.searchParams.get('limit');
    const offset = url.searchParams.get('offset');

    const opts = {};
    if (limit != null) opts.limit = Number(limit);
    if (offset != null) opts.offset = Number(offset);

    const result = kojo.ops.listInventory(opts);
    json(res, 200, result);
  });
};
