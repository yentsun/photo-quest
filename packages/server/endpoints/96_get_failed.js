/**
 * @file GET /failed -- List media whose file is missing/unreadable or whose
 * processing failed, grouped by content hash.
 *
 * `?count=1` returns just { groupCount, failedCount } for the sidebar badge.
 * `?refresh=1` bypasses the server-side file-check cache.
 * `?limit` / `?offset` paginate the returned groups.
 */

import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'GET',
    pathname: '/failed',
  }, (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const countOnly = url.searchParams.get('count') === '1';
    const refresh = url.searchParams.get('refresh') === '1';
    const limit = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : undefined;
    const offset = url.searchParams.has('offset') ? Number(url.searchParams.get('offset')) : undefined;
    logger.debug(`[GET /failed] countOnly=${countOnly} refresh=${refresh} limit=${limit} offset=${offset}`);
    const result = kojo.ops.listFailed({ countOnly, limit, offset, refresh });
    json(res, 200, result);
  });
};
