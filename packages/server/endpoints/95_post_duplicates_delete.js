/**
 * @file POST /duplicates/delete -- Delete every record in a duplicate group.
 *
 * Body: { ids }. Removes all selected verified duplicates (and their files on
 * disk).
 */

import { json, parseBody } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'POST',
    pathname: '/duplicates/delete',
  }, async (req, res) => {
    const body = await parseBody(req);
    const ids = body?.ids;

    if (!Array.isArray(ids)) {
      return json(res, 400, { error: 'ids are required' });
    }

    const result = kojo.ops.deleteDuplicates({ ids });
    logger.debug(`[POST /duplicates/delete] ids=${ids.join(',')} deleted=${result.deleted} deletedFiles=${result.deletedFiles}`);

    if (result.status) {
      return json(res, result.status, { error: result.error });
    }

    json(res, 200, result);
  });
};
