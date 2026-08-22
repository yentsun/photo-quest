/**
 * @file GET /jobs -- List all transcode jobs with media info.
 *
 * Returns every transcode job (running, queued, paused, completed, failed)
 * joined with the media title so the client can render the Transcodes page
 * and hydrate its transcode toaster on load.
 */

import { json } from '../src/http.js';
import { listTranscodeJobs } from '../ops/transcodeNow.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'GET',
    pathname: '/jobs',
  }, (req, res) => {
    const jobs = listTranscodeJobs(kojo);
    json(res, 200, { jobs });
  });
};
