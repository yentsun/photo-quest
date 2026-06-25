import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import { broadcastSse } from '../src/sse.js';

const FFPROBE_PATH = ffprobeInstaller.path;

/** Media IDs currently being processed — prevents double-start. */
export const inProgress = new Set();

export default async function (id) {
  const [kojo, logger] = this;
  const db = kojo.get('db');
  const mediaId = Number(id);

  const media = db.prepare('SELECT * FROM media WHERE id = ?').get(mediaId);
  if (!media || media.type !== 'video') return;
  if (media.status === 'ready') return;
  if (inProgress.has(mediaId)) return;

  inProgress.add(mediaId);
  logger.info(`[transcode] Starting on-demand for media ${mediaId}: ${media.path}`);
  run(db, media, logger).finally(() => inProgress.delete(mediaId));
}

async function run(db, media, logger) {
  try {
    logger.info(`[transcode] Probing: ${media.path}`);
    db.prepare("UPDATE media SET status = 'probing', updated_at = datetime('now') WHERE id = ?").run(media.id);

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
      return;
    }

    const dir = path.dirname(media.path);
    const base = path.basename(media.path, path.extname(media.path));
    const suffix = isMp4 ? '_converted' : '';
    const outputPath = path.join(dir, `${base}${suffix}.mp4`);

    /* Stream-copy when possible; re-encode only when codec is incompatible. */
    const videoArgs = isH264
      ? ['-c:v', 'copy']
      : ['-c:v', 'libx264', '-preset', 'slow', '-crf', '18'];
    const audioArgs = isAac
      ? ['-c:a', 'copy']
      : ['-c:a', 'aac', '-b:a', '192k'];

    logger.info(`[transcode] video=${isH264 ? 'copy' : 'libx264/crf18'} audio=${isAac ? 'copy' : 'aac/192k'} → ${outputPath}`);
    db.prepare("UPDATE media SET status = 'transcoding', updated_at = datetime('now') WHERE id = ?").run(media.id);

    await transcode(media.path, outputPath, videoArgs, audioArgs, (progressSecs) => {
      broadcastSse({ type: 'transcode_progress', mediaId: media.id, progressSecs });
    });

    db.prepare(
      "UPDATE media SET status = 'ready', transcoded_path = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(outputPath, media.id);

    try {
      fs.unlinkSync(media.path);
      logger.info(`[transcode] Deleted original: ${media.path}`);
    } catch (err) {
      logger.warn(`[transcode] Could not delete original: ${err.message}`);
    }

    broadcastSse({ type: 'transcode_complete', mediaId: media.id });
    logger.info(`[transcode] Done: ${outputPath}`);
  } catch (err) {
    logger.error(`[transcode] FAILED for media ${media.id}: ${err.message}`);
    db.prepare("UPDATE media SET status = 'error', updated_at = datetime('now') WHERE id = ?").run(media.id);
    db.prepare(
      "INSERT INTO jobs (media_id, type, status, error) VALUES (?, 'transcode', 'failed', ?)"
    ).run(media.id, err.message);
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

function transcode(inputPath, outputPath, videoArgs, audioArgs, onProgress) {
  return new Promise((resolve, reject) => {
    const args = [
      '-i', inputPath,
      ...videoArgs,
      ...audioArgs,
      '-movflags', '+faststart',
      '-y', outputPath,
    ];
    const proc = spawn(ffmpegPath, args);

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
      if (code !== 0) reject(new Error(`ffmpeg exited with code ${code}`));
      else resolve(outputPath);
    });
    proc.on('error', err => reject(new Error(`Failed to spawn ffmpeg: ${err.message}`)));
  });
}
