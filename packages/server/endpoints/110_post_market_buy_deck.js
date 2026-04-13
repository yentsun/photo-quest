/**
 * @file POST /market/buy-deck -- Buy an extra quest deck.
 */

import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'POST',
    pathname: '/market/buy-deck',
  }, (req, res) => {
    const result = kojo.ops.buyQuestDeck();

    if (!result) {
      return json(res, 400, { error: 'Insufficient magic dust or no media available' });
    }

    kojo.ops.bumpVersion('inventory');
    json(res, 201, result);
  });
};
