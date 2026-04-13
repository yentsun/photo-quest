/**
 * @file POST /inventory/:id/sell -- Sell a card back to the library.
 */

import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'POST',
    pathname: '/inventory/:id/sell',
  }, (req, res, params) => {
    const result = kojo.ops.sellInventoryItem(Number(params.id));

    if (!result) {
      return json(res, 404, { error: 'Inventory item not found' });
    }

    kojo.ops.bumpVersion('inventory');
    kojo.ops.bumpVersion('decks');
    json(res, 200, result);
  });
};
