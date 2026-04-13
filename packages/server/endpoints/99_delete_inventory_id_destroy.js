/**
 * @file DELETE /inventory/:id/destroy -- Destroy an inventory card (delete media + award dust).
 *
 * Kojo endpoint: registers route via the addHttpRoute op.
 * Delegates to `kojo.ops.destroyInventoryItem(id)`.
 */

import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'DELETE',
    pathname: '/inventory/:id/destroy',
  }, (req, res, params) => {
    const result = kojo.ops.destroyInventoryItem(Number(params.id));

    if (!result) {
      return json(res, 404, { error: 'Inventory item not found' });
    }

    kojo.ops.bumpVersion('inventory');
    kojo.ops.bumpVersion('decks');
    json(res, 200, result);
  });
};
