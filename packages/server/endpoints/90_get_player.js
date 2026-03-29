/**
 * @file GET /player -- Return player stats (magic dust balance).
 *
 * Kojo endpoint: registers route via the addHttpRoute op.
 * Delegates to `kojo.ops.getPlayerStats()`.
 */

import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'GET',
    pathname: '/player',
  }, (req, res) => {
    const stats = kojo.ops.getPlayerStats();
    json(res, 200, stats);
  });
};
