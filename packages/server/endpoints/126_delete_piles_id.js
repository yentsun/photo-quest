/**
 * @file DELETE /piles/:id -- Delete a pile.
 */

import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'DELETE',
    pathname: '/piles/:id',
  }, (req, res, params) => {
    const ok = kojo.ops.deletePile(Number(params.id));
    if (!ok) return json(res, 404, { error: 'Pile not found' });
    json(res, 204, null);
  });
};
