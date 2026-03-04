/**
 * @file Job processing pipeline -- orchestrates probe and transcode steps.
 *
 * This module is the "brain" of the worker.  It claims the next pending job
 * from the queue, determines what type of work needs to be done (probe or
 * transcode), delegates to the appropriate handler, and updates the database
 * with the results.
 *
 * The pipeline implements a two-stage ingest process:
 *
 *   Stage 1 -- PROBE
 *     Run ffprobe to extract metadata (duration, resolution, codec, size).
 *     Store the metadata on the media record.  Then decide whether the media
 *     needs transcoding:
 *       - If the video codec is already H.264 AND the container is MP4,
 *         mark the media as READY (no transcoding needed).
 *       - Otherwise, queue a TRANSCODE job.
 *
 *   Stage 2 -- TRANSCODE
 *     Run ffmpeg to convert the file to H.264/AAC MP4.  Update the media
 *     record with the path to the transcoded file and mark it as READY.
 *
 * Error handling:
 *   If any step fails, the job is marked FAILED (with an error message) and
 *   the associated media record is set to ERROR status.  This prevents the
 *   worker from retrying the same broken job in an infinite loop.
 */

import { JOB_TYPE, MEDIA_STATUS } from '@photo-quest/shared';
import {
  claimNextJob, completeJob, failJob, createJob,
  updateJobProgress, updateMediaStatus
} from './queue.js';
import { ffprobe } from './probe.js';
import { transcode } from './transcode.js';

/**
 * Attempt to process the next pending job in the queue.
 *
 * @returns {Promise<boolean>} `true` if a job was claimed and processed
 *   (regardless of success or failure), `false` if the queue was empty.
 */
export async function processNextJob() {
  const job = claimNextJob();
  if (!job) return false;

  console.debug(`[pipeline] Job #${job.id} claimed: ${job.type} for "${job.media_title}"`);

  try {
    switch (job.type) {
      case JOB_TYPE.PROBE:
        await handleProbe(job);
        break;
      case JOB_TYPE.TRANSCODE:
        await handleTranscode(job);
        break;
      default:
        throw new Error(`Unknown job type: ${job.type}`);
    }
    console.debug(`[pipeline] Job #${job.id} completed`);
    return true;
  } catch (err) {
    console.error(`[pipeline] Job #${job.id} failed:`, err.message);

    /* Mark the job as failed and the media as errored. */
    failJob(job.id, err.message);
    updateMediaStatus(job.media_id, MEDIA_STATUS.ERROR);

    return true;
  }
}

/**
 * Handle a PROBE job: extract metadata and decide if transcoding is needed.
 */
async function handleProbe(job) {
  const info = await ffprobe(job.media_path);

  completeJob(job.id, {
    mediaUpdate: {
      mediaId: job.media_id,
      status: MEDIA_STATUS.PROBED,
      duration: info.duration,
      width: info.width,
      height: info.height,
      codec: info.codec,
      size: info.size
    }
  });

  /* Skip transcoding only when already H.264 in an MP4 container. */
  const needsTranscode = info.codec !== 'h264' || !job.media_path.endsWith('.mp4');

  if (needsTranscode) {
    createJob(job.media_id, JOB_TYPE.TRANSCODE);
    console.debug(`[pipeline] Queued transcode for "${job.media_title}"`);
  } else {
    updateMediaStatus(job.media_id, MEDIA_STATUS.READY);
    console.debug(`[pipeline] "${job.media_title}" already H.264 MP4, marked ready`);
  }
}

/**
 * Handle a TRANSCODE job: convert media to H.264/AAC MP4.
 */
async function handleTranscode(job) {
  updateMediaStatus(job.media_id, MEDIA_STATUS.TRANSCODING);

  const outputPath = await transcode(job.media_path, job.media_id, (seconds) => {
    updateJobProgress(job.id, Math.min(99, seconds));
  });

  completeJob(job.id, {
    mediaUpdate: {
      mediaId: job.media_id,
      status: MEDIA_STATUS.READY,
      transcoded_path: outputPath
    }
  });

  console.debug(`[pipeline] Transcoded "${job.media_title}" → ${outputPath}`);
}
