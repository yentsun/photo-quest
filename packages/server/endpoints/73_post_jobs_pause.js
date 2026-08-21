/**
 * @file POST /jobs/pause -- Pause the whole transcode pipeline.
 *
 * Holds every queued/running job and kills the current ffmpeg process.
 * Resume restarts paused jobs from scratch.
 */

import { json } from '../src/http.js';
import { pauseAllTranscodes } from '../ops/transcodeNow.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'POST',
    pathname: '/jobs/pause',
  }, (req, res) => {
    const result = pauseAllTranscodes(kojo, logger);
    json(res, 200, result);
  });
};
