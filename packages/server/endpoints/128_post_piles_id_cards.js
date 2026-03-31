/**
 * @file POST /piles/:id/cards -- Add cards to a pile.
 * Body: { inventoryIds: number[] }
 */

import { json, parseBody } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'POST',
    pathname: '/piles/:id/cards',
  }, async (req, res, params) => {
    const body = await parseBody(req);
    const result = kojo.ops.addToPile(Number(params.id), body?.inventoryIds || []);
    json(res, 200, result);
  });
};
