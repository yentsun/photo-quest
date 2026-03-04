/**
 * @file GET /media -- Return all media records from the library.
 *
 * Kojo endpoint: registers route via the addHttpRoute op.
 * Delegates to `kojo.ops.listMedia()` for the actual database query.
 */

import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'GET',
    pathname: '/media',
  }, (req, res) => {
    const rows = kojo.ops.listMedia();
    json(res, 200, rows);
  });
};
