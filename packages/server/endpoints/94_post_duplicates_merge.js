/**
 * @file POST /duplicates/merge -- Merge a duplicate group into one record.
 *
 * Body: { keepId, removeIds } where keepId is the record to keep and
 * removeIds are the other copies to delete (record + file on disk).
 * The master absorbs the union of tags and the sum of likes.
 */

import { json, parseBody } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'POST',
    pathname: '/duplicates/merge',
  }, async (req, res) => {
    const body = await parseBody(req);
    const keepId = body?.keepId;
    const removeIds = body?.removeIds;

    if (keepId == null || !Array.isArray(removeIds)) {
      return json(res, 400, { error: 'Missing required fields: keepId, removeIds' });
    }

    const result = kojo.ops.mergeDuplicates({ keepId, removeIds });
    logger.debug(`[POST /duplicates/merge] keepId=${keepId} result=${JSON.stringify({ merged: result.merged, deletedFiles: result.deletedFiles })}`);

    if (result.status) {
      return json(res, result.status, { error: result.error });
    }

    json(res, 200, result);
  });
};
