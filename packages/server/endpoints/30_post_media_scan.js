/**
 * @file POST /media/scan -- Trigger a directory scan for new media files.
 *
 * Kojo endpoint: registers route via the addHttpRoute op.
 * Expects a JSON body with `{ path: "/absolute/path/to/media" }`.
 * Delegates to `kojo.ops.scanMedia(dirPath)` which discovers files, queues
 * them in the import_queue table, and begins async processing.
 *
 * Returns immediately with { scanId, total } — the client can track
 * progress via SSE (import_progress / import_complete events).
 */

import { json, parseBody } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'POST',
    pathname: '/media/scan',
  }, async (req, res) => {
    const body = await parseBody(req);
    logger.debug(`[POST /media/scan] body=${JSON.stringify(body)}`);

    if (!body || !body.path) {
      logger.debug(`[POST /media/scan] missing path in body`);
      return json(res, 400, { error: 'Missing "path" in request body' });
    }

    logger.debug(`[POST /media/scan] scanning path="${body.path}"`);
    try {
      const result = kojo.ops.scanMedia(body.path);
      logger.debug(`[POST /media/scan] → scanId=${result.scanId} total=${result.total}`);
      json(res, 200, result);
    } catch (err) {
      logger.debug(`[POST /media/scan] error: ${err.message}`);
      json(res, 400, { error: err.message });
    }
  });
};
