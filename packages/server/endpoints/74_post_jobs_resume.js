/**
 * @file POST /jobs/resume -- Resume the whole transcode pipeline.
 *
 * Marks every paused job as pending again and kicks the single runner.
 */

import { json } from '../src/http.js';
import { resumeAllTranscodes } from '../ops/transcodeNow.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'POST',
    pathname: '/jobs/resume',
  }, (req, res) => {
    const result = resumeAllTranscodes(kojo, logger);
    json(res, 200, result);
  });
};
