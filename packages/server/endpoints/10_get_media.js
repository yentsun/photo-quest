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
    const url = new URL(req.url, `http://${req.headers.host}`);
    const limit = url.searchParams.get('limit');
    const offset = url.searchParams.get('offset');
    const folder = url.searchParams.get('folder');
    const subtree = url.searchParams.get('subtree');
    const liked = url.searchParams.get('liked');

    const opts = {};
    if (limit != null) opts.limit = Number(limit);
    if (offset != null) opts.offset = Number(offset);
    if (folder != null) opts.folder = folder;
    if (subtree === '1') opts.subtree = true;
    if (liked === '1') opts.liked = true;

    const result = kojo.ops.listMedia(opts);
    json(res, 200, result);
  });
};
