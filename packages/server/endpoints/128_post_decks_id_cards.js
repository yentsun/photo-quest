/**
 * @file POST /decks/:id/cards -- Add cards to a deck.
 * Body: { inventoryIds: number[] }
 */

import { json, parseBody } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'POST',
    pathname: '/decks/:id/cards',
  }, async (req, res, params) => {
    const body = await parseBody(req);
    const result = kojo.ops.addToDeck(Number(params.id), body?.inventoryIds || []);
    kojo.ops.bumpVersion('decks');
    kojo.ops.bumpVersion('inventory');
    json(res, 200, result);
  });
};
