/**
 * @file GET /quest/decks -- List today's quest decks.
 *
 * Kojo endpoint: registers route via the addHttpRoute op.
 * Delegates to `kojo.ops.getQuestDecks()`.
 */

import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'GET',
    pathname: '/quest/decks',
  }, (req, res) => {
    const result = kojo.ops.getQuestDecks();
    json(res, 200, result);
  });
};
