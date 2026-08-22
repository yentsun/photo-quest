/**
 * @file POST /jobs/:id/cancel -- Cancel a single job.
 *
 * Removes the job (queued or running). If it is the running job, the current
 * ffmpeg process is killed; the media record falls back to 'probed'.
 */

import { json } from '../src/http.js';
import { cancelJob } from '../ops/transcodeNow.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'POST',
    pathname: '/jobs/:id/cancel',
  }, (req, res, params) => {
    const result = cancelJob(kojo, logger, params.id);
    if (!result.cancelled) {
      return json(res, 404, { error: 'Job not found' });
    }
    json(res, 200, result);
  });
};
