/**
 * @file GET /quest/decks/:id -- Get a specific deck with current card.
 *
 * Kojo endpoint: registers route via the addHttpRoute op.
 * Delegates to `kojo.ops.getQuestDeck(id)`.
 */

import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'GET',
    pathname: '/quest/decks/:id',
  }, (req, res, params) => {
    const result = kojo.ops.getQuestDeck(Number(params.id));

    if (!result) {
      return json(res, 404, { error: 'Deck not found' });
    }

    json(res, 200, result);
  });
};
