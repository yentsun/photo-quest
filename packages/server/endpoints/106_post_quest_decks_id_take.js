/**
 * @file POST /quest/decks/:id/take -- Spend dust to take current card into inventory.
 *
 * Kojo endpoint: registers route via the addHttpRoute op.
 * Delegates to `kojo.ops.takeQuestCard(id)`.
 */

import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'POST',
    pathname: '/quest/decks/:id/take',
  }, (req, res, params) => {
    const result = kojo.ops.takeQuestCard(Number(params.id));

    if (!result) {
      return json(res, 404, { error: 'Deck not found or already exhausted' });
    }

    if (result.error) {
      return json(res, 400, { error: result.error });
    }

    kojo.ops.bumpVersion('inventory');
    kojo.ops.bumpVersion('player');
    json(res, 200, result.deck);
  });
};
