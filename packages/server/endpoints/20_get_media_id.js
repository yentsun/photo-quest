/**
 * @file GET /media/:id -- Return a single media record by its primary key.
 *
 * Kojo endpoint: registers route via the addHttpRoute op.
 * Delegates to `kojo.ops.getMediaById(id)` for the database lookup.
 */

import { json } from '../src/http.js';
import { inProgress as transcodeInProgress } from '../ops/transcodeNow.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'GET',
    pathname: '/media/:id',
  }, (req, res, params) => {
    logger.debug(`[GET /media/:id] id=${params.id}`);
    const row = kojo.ops.getMediaById(Number(params.id));

    if (!row) {
      logger.debug(`[GET /media/:id] not found: id=${params.id}`);
      return json(res, 404, { error: 'Media not found' });
    }

    const INCOMPLETE = ['pending', 'probing', 'probed', 'transcoding'];
    if (row.type === 'video' && INCOMPLETE.includes(row.status) && !transcodeInProgress.has(row.id)) {
      logger.debug(`[GET /media/:id] triggering on-demand transcode for id=${params.id} (status=${row.status})`);
      kojo.ops.transcodeNow(row.id);
    }

    logger.debug(`[GET /media/:id] found: id=${params.id} status=${row.status}`);
    json(res, 200, row);
  });
};
