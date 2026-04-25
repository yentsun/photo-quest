/**
 * @file POST /quest/decks/:id/next -- Advance to the next card in a deck.
 *
 * Kojo endpoint: registers route via the addHttpRoute op.
 * Delegates to `kojo.ops.advanceQuestDeck(id)`.
 */

import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'POST',
    pathname: '/quest/decks/:id/next',
  }, (req, res, params) => {
    const result = kojo.ops.advanceQuestDeck(Number(params.id));

    if (!result) {
      return json(res, 404, { error: 'Deck not found or already exhausted' });
    }

    if (result.exhausted) kojo.ops.bumpVersion('inventory');
    json(res, 200, result);
  });
};
