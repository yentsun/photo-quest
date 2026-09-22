/**
 * @file POST /failed/repair -- Try to repair failed media records.
 *
 * Body: { ids?: number[], all?: boolean, force?: boolean }. Re-checks each
 * record's files on disk and reconciles its status (see ops/repairFailed.js).
 * `force` re-transcodes videos from their original, discarding the existing
 * (unplayable) transcoded output.
 */

import { json, parseBody } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'POST',
    pathname: '/failed/repair',
  }, async (req, res) => {
    const body = await parseBody(req);
    const ids = body?.ids;
    const all = body?.all === true;
    const force = body?.force === true;

    if (!all && !Array.isArray(ids)) {
      return json(res, 400, { error: 'ids or all is required' });
    }

    const result = kojo.ops.repairFailed({ ids, all, force });
    logger.debug(`[POST /failed/repair] all=${all} force=${force} repaired=${result.repaired} restored=${result.restored} requeued=${result.requeued} unrepairable=${result.unrepairable}`);
    json(res, 200, result);
  });
};
