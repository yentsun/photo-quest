/**
 * @file POST /duplicates/merge -- Merge a duplicate group into one record.
 *
 * Body: { ids }. Keeps the most "mature" copy (earliest created_at,
 * tie-broken by most likes), absorbs the union of tags and the sum of likes,
 * and removes the other copies (record + file on disk).
 */

import { json, parseBody } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'POST',
    pathname: '/duplicates/merge',
  }, async (req, res) => {
    const body = await parseBody(req);
    const ids = body?.ids;

    if (!Array.isArray(ids)) {
      return json(res, 400, { error: 'ids are required' });
    }

    const result = kojo.ops.mergeDuplicates({ ids });
    logger.debug(`[POST /duplicates/merge] ids=${ids.join(',')} merged=${result.merged} deletedFiles=${result.deletedFiles}`);

    if (result.status) {
      return json(res, result.status, { error: result.error });
    }

    json(res, 200, result);
  });
};
