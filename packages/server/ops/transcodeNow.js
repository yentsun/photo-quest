import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import { JOB_STATUS, JOB_TYPE } from '@photo-quest/shared';
import { broadcastSse } from '../src/sse.js';

const FFPROBE_PATH = ffprobeInstaller.path;

/** The ffmpeg child currently running, if any. */
let currentChild = null;

/** Whether a job is being processed right now — enforces a strict queue of 1. */
let running = false;

/** Media IDs currently queued or running — prevents duplicate jobs per media. */
const queuedMedia = new Set();

export function hasQueuedTranscode(id) {
  return queuedMedia.has(Number(id));
}

/** Pick the oldest pending job and start transcoding it. */
function kick(kojo, logger) {
  if (running) return;
  const db = kojo.get('db');

  const job = db.prepare(
    "SELECT id, media_id FROM jobs WHERE type = ? AND status = ? ORDER BY id ASC LIMIT 1"
  ).get(JOB_TYPE.TRANSCODE, JOB_STATUS.PENDING);
  if (!job) return;

  running = true;
  runJob(kojo, db, logger, job).finally(() => {
    running = false;
    kick(kojo, logger);
  });
}

/**
 * Queue a media item for transcoding. Returns the job id, or null if skipped.
 * Registered as `kojo.ops.transcodeNow` (the default export of this file).
 */
export default function transcodeNow(id) {
  const [kojo, logger] = this;
  const db = kojo.get('db');
  const mediaId = Number(id);

  const media = db.prepare('SELECT * FROM media WHERE id = ?').get(mediaId);
  if (!media || media.type !== 'video') return null;
  if (media.status === 'ready') return null;
  if (queuedMedia.has(mediaId)) return null;

  /* DB-level dedupe: skip if an active (queued/running/paused) job already
     exists for this media — the in-memory Set is reset on restart. */
  const active = db.prepare(
    "SELECT id FROM jobs WHERE media_id = ? AND type = ? AND status IN (?, ?, ?) LIMIT 1"
  ).get(mediaId, JOB_TYPE.TRANSCODE, JOB_STATUS.PENDING, JOB_STATUS.RUNNING, JOB_STATUS.PAUSED);
  if (active) return active.id;

  /* Resume a previously paused job for this media if present. */
  const paused = db.prepare(
    "SELECT id FROM jobs WHERE media_id = ? AND type = ? AND status = ? LIMIT 1"
  ).get(mediaId, JOB_TYPE.TRANSCODE, JOB_STATUS.PAUSED);
  let jobId;
  if (paused) {
    db.prepare("UPDATE jobs SET status = ?, updated_at = datetime('now') WHERE id = ?")
      .run(JOB_STATUS.PENDING, paused.id);
    jobId = paused.id;
  } else {
    const result = db.prepare(
      "INSERT INTO jobs (media_id, type, status) VALUES (?, ?, ?)"
    ).run(mediaId, JOB_TYPE.TRANSCODE, JOB_STATUS.PENDING);
    jobId = result.lastInsertRowid;
  }

  queuedMedia.add(mediaId);
  logger.info(`[transcode] Queued media ${mediaId}: ${media.path} (job ${jobId})`);
  broadcastSse({ type: 'transcode_queued', mediaId, jobId });
  kick(kojo, logger);
  return jobId;
}

async function runJob(kojo, db, logger, job) {
  const media = db.prepare('SELECT * FROM media WHERE id = ?').get(job.media_id);
  if (!media) {
    db.prepare("UPDATE jobs SET status = ?, updated_at = datetime('now') WHERE id = ?")
      .run(JOB_STATUS.FAILED, job.id);
    queuedMedia.delete(job.media_id);
    return;
  }

  try {
    logger.info(`[transcode] Probing: ${media.path}`);
    db.prepare("UPDATE media SET status = 'probing', updated_at = datetime('now') WHERE id = ?").run(media.id);
    db.prepare("UPDATE jobs SET status = ?, updated_at = datetime('now') WHERE id = ?")
      .run(JOB_STATUS.RUNNING, job.id);

    const info = await probe(media.path);
    logger.info(`[transcode] Probe done: videoCodec=${info.codec} audioCodec=${info.audioCodec} duration=${info.duration}s ${info.width}x${info.height}`);

    db.prepare(
      "UPDATE media SET status = 'probed', codec = ?, duration = ?, width = ?, height = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(info.codec, info.duration, info.width, info.height, media.id);

    const isMp4 = media.path.toLowerCase().endsWith('.mp4');
    const isH264 = info.codec === 'h264';
    const isAac = info.audioCodec === 'aac';

    if (isH264 && isAac && isMp4) {
      logger.info(`[transcode] Already H.264+AAC MP4, marking ready`);
      db.prepare("UPDATE media SET status = 'ready', updated_at = datetime('now') WHERE id = ?").run(media.id);
      db.prepare("UPDATE jobs SET status = ?, updated_at = datetime('now') WHERE id = ?")
        .run(JOB_STATUS.COMPLETED, job.id);
      queuedMedia.delete(media.id);
      broadcastSse({ type: 'transcode_complete', mediaId: media.id, jobId: job.id });
      return;
    }

    const dir = path.dirname(media.path);
    const base = path.basename(media.path, path.extname(media.path));
    const suffix = isMp4 ? '_converted' : '';
    let outputPath = path.join(dir, `${base}${suffix}.mp4`);

    /* Avoid overwriting an existing file that may belong to another media record. */
    let counter = 1;
    while (fs.existsSync(outputPath)) {
      outputPath = path.join(dir, `${base}${suffix}_${counter}.mp4`);
      counter++;
    }

    /* Stream-copy when possible; re-encode only when codec is incompatible. */
    const videoArgs = isH264
      ? ['-c:v', 'copy']
      : ['-c:v', 'libx264', '-preset', 'slow', '-crf', '18'];
    const audioArgs = isAac
      ? ['-c:a', 'copy']
      : ['-c:a', 'aac', '-b:a', '192k'];

    logger.info(`[transcode] video=${isH264 ? 'copy' : 'libx264/crf18'} audio=${isAac ? 'copy' : 'aac/192k'} → ${outputPath}`);
    db.prepare("UPDATE media SET status = 'transcoding', updated_at = datetime('now') WHERE id = ?").run(media.id);

    await transcode(media, outputPath, videoArgs, audioArgs, (secs) => {
      const progress = media.duration > 0 ? Math.min(99, Math.round((secs / media.duration) * 100)) : 0;
      db.prepare("UPDATE jobs SET progress = ?, updated_at = datetime('now') WHERE id = ?")
        .run(progress, job.id);
      broadcastSse({ type: 'transcode_progress', mediaId: media.id, jobId: job.id, progress, progressSecs: secs });
    });

    db.prepare(
      "UPDATE media SET status = 'ready', transcoded_path = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(outputPath, media.id);
    db.prepare("UPDATE jobs SET status = ?, progress = 100, updated_at = datetime('now') WHERE id = ?")
      .run(JOB_STATUS.COMPLETED, job.id);

    try {
      fs.unlinkSync(media.path);
      logger.info(`[transcode] Deleted original: ${media.path}`);
    } catch (err) {
      logger.warn(`[transcode] Could not delete original: ${err.message}`);
    }

    queuedMedia.delete(media.id);
    broadcastSse({ type: 'transcode_complete', mediaId: media.id, jobId: job.id });
    logger.info(`[transcode] Done: ${outputPath}`);
  } catch (err) {
    /* A killed (paused/cancelled) ffmpeg should not mark the job failed. */
    const jobState = db.prepare('SELECT status FROM jobs WHERE id = ?').get(job.id);
    if (jobState && (jobState.status === JOB_STATUS.PAUSED || jobState.status === JOB_STATUS.COMPLETED)) {
      logger.info(`[transcode] Job ${job.id} stopped (${jobState.status}); skipping failure`);
      return;
    }

    logger.error(`[transcode] FAILED for media ${media.id}: ${err.message}`);
    db.prepare("UPDATE media SET status = 'error', updated_at = datetime('now') WHERE id = ?").run(media.id);
    db.prepare(
      "UPDATE jobs SET status = ?, error = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(JOB_STATUS.FAILED, err.message, job.id);
    broadcastSse({ type: 'transcode_failed', mediaId: media.id, jobId: job.id, error: err.message });
  } finally {
    queuedMedia.delete(media.id);
  }
}

/** Pause the whole pipeline: hold the queue and kill the running ffmpeg. */
export function pauseAllTranscodes(kojo, logger) {
  const db = kojo.get('db');

  const affected = db.prepare(
    "UPDATE jobs SET status = ?, updated_at = datetime('now') WHERE type = ? AND status IN (?, ?)"
  ).run(JOB_STATUS.PAUSED, JOB_TYPE.TRANSCODE, JOB_STATUS.PENDING, JOB_STATUS.RUNNING);

  if (currentChild) {
    try { currentChild.kill('SIGKILL'); } catch {}
    currentChild = null;
  }

  /* Any media mid-transcode should fall back to probed so it can be re-queued. */
  db.prepare("UPDATE media SET status = 'probed', updated_at = datetime('now') WHERE status = 'transcoding'").run();

  logger.info(`[transcode] Paused ${affected.changes} job(s)`);
  broadcastSse({ type: 'transcode_paused' });
  return { paused: affected.changes };
}

/** Resume the whole pipeline: mark paused jobs pending and kick the runner. */
export function resumeAllTranscodes(kojo, logger) {
  const db = kojo.get('db');

  const affected = db.prepare(
    "UPDATE jobs SET status = ?, updated_at = datetime('now') WHERE type = ? AND status = ?"
  ).run(JOB_STATUS.PENDING, JOB_TYPE.TRANSCODE, JOB_STATUS.PAUSED);

  logger.info(`[transcode] Resumed ${affected.changes} job(s)`);
  broadcastSse({ type: 'transcode_resumed' });
  kick(kojo, logger);
  return { resumed: affected.changes };
}

/** Cancel a single job. If it is the running job, kill the child. */
export function cancelJob(kojo, logger, id) {
  const db = kojo.get('db');
  const jobId = Number(id);

  const job = db.prepare('SELECT id, media_id, status FROM jobs WHERE id = ?').get(jobId);
  if (!job) return { cancelled: false };

  if (job.status === JOB_STATUS.RUNNING && currentChild) {
    try { currentChild.kill('SIGKILL'); } catch {}
    currentChild = null;
  }

  db.prepare("UPDATE jobs SET status = ?, updated_at = datetime('now') WHERE id = ?")
    .run(JOB_STATUS.COMPLETED, jobId);
  db.prepare("UPDATE media SET status = 'probed', updated_at = datetime('now') WHERE id = ? AND status IN ('pending', 'probing', 'transcoding')").run(job.media_id);

  queuedMedia.delete(job.media_id);
  broadcastSse({ type: 'transcode_cancelled', mediaId: job.media_id, jobId });
  logger.info(`[transcode] Cancelled job ${jobId}`);
  return { cancelled: true };
}

/** List all transcode jobs joined with media info, newest first. */
export function listTranscodeJobs(kojo) {
  const db = kojo.get('db');
  return db.prepare(
    `SELECT j.id, j.media_id, j.type, j.status, j.progress, j.error, j.created_at, j.updated_at,
            m.title, m.type AS media_type
     FROM jobs j JOIN media m ON m.id = j.media_id
     WHERE j.type = ?
     ORDER BY j.id DESC`
  ).all(JOB_TYPE.TRANSCODE);
}

/** Mark leftover running jobs as pending on boot so an interrupted transcode
 *  resumes after a restart. Pending jobs are left alone — they were created
 *  on-demand by the user opening media, not auto-resumed. */
export function resumePendingTranscodes(kojo, logger) {
  const db = kojo.get('db');
  const affected = db.prepare(
    "UPDATE jobs SET status = ?, updated_at = datetime('now') WHERE type = ? AND status = ?"
  ).run(JOB_STATUS.PENDING, JOB_TYPE.TRANSCODE, JOB_STATUS.RUNNING);
  if (affected.changes > 0) {
    logger.info(`[transcode] Re-queued ${affected.changes} interrupted job(s) from previous session`);
    kick(kojo, logger);
  }
}

function probe(filePath) {
  return new Promise((resolve, reject) => {
    const args = ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath];
    const proc = spawn(FFPROBE_PATH, args);
    const chunks = [];
    proc.stdout.on('data', chunk => chunks.push(chunk));
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(`ffprobe exited with code ${code}`));
      try {
        const out = JSON.parse(Buffer.concat(chunks).toString());
        const video = out.streams?.find(s => s.codec_type === 'video');
        const audio = out.streams?.find(s => s.codec_type === 'audio');
        resolve({
          duration: parseFloat(out.format?.duration) || 0,
          width: video?.width || 0,
          height: video?.height || 0,
          codec: video?.codec_name || 'unknown',
          audioCodec: audio?.codec_name || 'unknown',
        });
      } catch (e) {
        reject(new Error(`Failed to parse ffprobe output: ${e.message}`));
      }
    });
    proc.on('error', err => reject(new Error(`Failed to spawn ffprobe: ${err.message}`)));
  });
}

function transcode(media, outputPath, videoArgs, audioArgs, onProgress) {
  return new Promise((resolve, reject) => {
    const args = [
      '-i', media.path,
      ...videoArgs,
      ...audioArgs,
      '-movflags', '+faststart',
      '-y', outputPath,
    ];
    const proc = spawn(ffmpegPath, args);
    currentChild = proc;

    let buf = '';
    proc.stderr.on('data', chunk => {
      buf += chunk.toString();
      const lines = buf.split(/\r?\n|\r/);
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const m = line.match(/time=(\d+):(\d+):(\d+\.\d+)/);
        if (m) {
          const secs = parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3]);
          onProgress(secs);
        }
      }
    });

    proc.on('close', code => {
      if (currentChild === proc) currentChild = null;
      if (code !== 0 && code !== null) reject(new Error(`ffmpeg exited with code ${code}`));
      else resolve(outputPath);
    });
    proc.on('error', err => {
      if (currentChild === proc) currentChild = null;
      reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
    });
  });
}