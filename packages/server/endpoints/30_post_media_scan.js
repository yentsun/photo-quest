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

    if (!body || !body.path) {
      return json(res, 400, { error: 'Missing "path" in request body' });
    }

    try {
      const result = kojo.ops.scanMedia(body.path);
      json(res, 200, result);
    } catch (err) {
      json(res, 400, { error: err.message });
    }
  });
};
