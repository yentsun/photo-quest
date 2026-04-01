/**
 * @file POST /quest/decks/:id/destroy -- Destroy current quest card, award dust, advance.
 *
 * Kojo endpoint: registers route via the addHttpRoute op.
 * Delegates to `kojo.ops.destroyQuestCard(id)`.
 */

import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'POST',
    pathname: '/quest/decks/:id/destroy',
  }, (req, res, params) => {
    const result = kojo.ops.destroyQuestCard(Number(params.id));

    if (!result) {
      return json(res, 404, { error: 'Deck not found or already exhausted' });
    }

    json(res, 200, result);
  });
};
