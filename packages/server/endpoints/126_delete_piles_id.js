/**
 * @file DELETE /decks/:id -- Delete a deck.
 */

import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'DELETE',
    pathname: '/decks/:id',
  }, (req, res, params) => {
    const ok = kojo.ops.deletePile(Number(params.id));
    if (!ok) return json(res, 404, { error: 'Deck not found' });
    kojo.ops.bumpVersion('decks');
    kojo.ops.bumpVersion('inventory');
    json(res, 204, null);
  });
};
