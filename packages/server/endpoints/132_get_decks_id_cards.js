/**
 * @file GET /decks/:id/cards -- List cards in a deck.
 */

import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'GET',
    pathname: '/decks/:id/cards',
  }, (req, res, params) => {
    json(res, 200, kojo.ops.listDeckCards(Number(params.id)));
  });
};
