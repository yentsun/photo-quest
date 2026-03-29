/**
 * @file GET /piles/:id/cards -- List cards in a pile.
 */

import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'GET',
    pathname: '/piles/:id/cards',
  }, (req, res, params) => {
    json(res, 200, kojo.ops.listPileCards(Number(params.id)));
  });
};
