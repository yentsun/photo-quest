/**
 * @file DELETE /piles/:id/cards/:inventoryId -- Remove a card from a pile.
 */

import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'DELETE',
    pathname: '/piles/:id/cards/:inventoryId',
  }, (req, res, params) => {
    const ok = kojo.ops.removeFromPile(Number(params.id), Number(params.inventoryId));
    if (!ok) return json(res, 404, { error: 'Card not in pile' });
    json(res, 204, null);
  });
};
