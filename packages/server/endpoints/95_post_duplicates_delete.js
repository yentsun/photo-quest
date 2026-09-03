/**
 * @file POST /duplicates/delete -- Delete every record in a duplicate group.
 *
 * Body: { hash }. Removes all records sharing the hash (and their files on
 * disk).
 */

import { json, parseBody } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'POST',
    pathname: '/duplicates/delete',
  }, async (req, res) => {
    const body = await parseBody(req);
    const hash = body?.hash;

    if (!hash) {
      return json(res, 400, { error: 'hash is required' });
    }

    const result = kojo.ops.deleteDuplicates({ hash });
    logger.debug(`[POST /duplicates/delete] hash=${hash} deleted=${result.deleted} deletedFiles=${result.deletedFiles}`);

    if (result.status) {
      return json(res, result.status, { error: result.error });
    }

    json(res, 200, result);
  });
};
