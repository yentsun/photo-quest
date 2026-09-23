/**
 * @file POST /jobs/:id/retry -- Re-queue a cancelled or failed transcode job.
 *
 * Clears the job's error, sets it back to `pending`, resets the media to
 * `pending` and kicks the runner.
 */

import { json } from '../src/http.js';
import { retryJob } from '../ops/transcodeNow.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'POST',
    pathname: '/jobs/:id/retry',
  }, (req, res, params) => {
    const result = retryJob(kojo, logger, params.id);
    if (!result.retried) {
      return json(res, result.status ?? 400, { error: result.error });
    }
    json(res, 200, result);
  });
};
