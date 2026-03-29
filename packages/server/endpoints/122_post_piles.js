/**
 * @file POST /piles -- Create a new pile.
 * Body: { name?: string, inventoryIds?: number[] }
 */

import { json, parseBody } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'POST',
    pathname: '/piles',
  }, async (req, res) => {
    const body = await parseBody(req);
    const result = kojo.ops.createPile(body?.name, body?.inventoryIds || []);
    json(res, 201, result);
  });
};
