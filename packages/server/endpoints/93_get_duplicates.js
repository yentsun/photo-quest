/**
 * @file GET /duplicates -- List groups of duplicate media sharing the same hash.
 *
 * `?count=1` returns just { groupCount, copyCount } for the sidebar badge,
 * without downloading the item rows for every duplicate.
 */

import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'GET',
    pathname: '/duplicates',
  }, (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const countOnly = url.searchParams.get('count') === '1';
    logger.debug(`[GET /duplicates] countOnly=${countOnly}`);
    const result = kojo.ops.listDuplicates({ countOnly });
    json(res, 200, result);
  });
};
