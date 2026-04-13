/**
 * @file DELETE /decks/:id/cards/:inventoryId -- Remove a card from a deck.
 */

import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'DELETE',
    pathname: '/decks/:id/cards/:inventoryId',
  }, (req, res, params) => {
    const ok = kojo.ops.removeFromPile(Number(params.id), Number(params.inventoryId));
    if (!ok) return json(res, 404, { error: 'Card not in deck' });
    kojo.ops.bumpVersion('decks');
    kojo.ops.bumpVersion('inventory');
    json(res, 204, null);
  });
};
