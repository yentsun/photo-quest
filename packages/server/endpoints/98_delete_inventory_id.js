/**
 * @file DELETE /inventory/:id -- Remove an item from the player's inventory.
 *
 * Kojo endpoint: registers route via the addHttpRoute op.
 * Delegates to `kojo.ops.removeFromInventory(id)`.
 */

import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'DELETE',
    pathname: '/inventory/:id',
  }, (req, res, params) => {
    const deleted = kojo.ops.removeFromInventory(Number(params.id));

    if (!deleted) {
      return json(res, 404, { error: 'Inventory item not found' });
    }

    json(res, 204, null);
  });
};
