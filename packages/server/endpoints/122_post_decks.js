/**
 * @file POST /decks -- Create a new deck.
 * Body: { name?: string, inventoryIds?: number[] }
 */

import { json, parseBody } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'POST',
    pathname: '/decks',
  }, async (req, res) => {
    const body = await parseBody(req);
    const result = kojo.ops.createDeck(body?.name, body?.inventoryIds || []);
    kojo.ops.bumpVersion('decks');
    kojo.ops.bumpVersion('inventory');
    json(res, 201, result);
  });
};
