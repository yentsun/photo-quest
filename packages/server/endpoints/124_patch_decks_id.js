/**
 * @file PATCH /decks/:id -- Rename a deck.
 * Body: { name: string }
 */

import { json, parseBody } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'PATCH',
    pathname: '/decks/:id',
  }, async (req, res, params) => {
    const body = await parseBody(req);
    const ok = kojo.ops.renameDeck(Number(params.id), body?.name);
    if (!ok) return json(res, 404, { error: 'Deck not found' });
    kojo.ops.bumpVersion('decks');
    json(res, 200, { ok: true });
  });
};
