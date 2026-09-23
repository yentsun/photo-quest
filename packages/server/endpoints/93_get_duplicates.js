/**
 * @file GET /duplicates -- List groups of duplicate media sharing the same hash.
 *
 * `?count=1` returns just { groupCount, copyCount } for the sidebar badge,
 * without downloading the item rows for every duplicate.
 *
 * `?limit` / `?offset` paginate the returned groups so a large library page
 * incrementally (never materialised all at once). The response always carries
 * the effective `groupCount` / `copyCount` totals so the client can render an
 * accurate count and drive a "load more" loop.
 */

import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'GET',
    pathname: '/duplicates',
  }, (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const countOnly = url.searchParams.get('count') === '1';
    const limit = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : undefined;
    const offset = url.searchParams.has('offset') ? Number(url.searchParams.get('offset')) : undefined;
    logger.debug(`[GET /duplicates] countOnly=${countOnly} limit=${limit} offset=${offset}`);
    const result = kojo.ops.listDuplicates({ countOnly, limit, offset });
    json(res, 200, result);
  });
};
