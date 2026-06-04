import { spawn } from 'node:child_process';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';

const FFPROBE_PATH = ffprobeInstaller.path;

/** Media IDs currently being processed — prevents double-start. */
const inProgress = new Set();

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
    logger.info(`[transcode] Probe done: codec=${info.codec} duration=${info.duration}s ${info.width}x${info.height}`);

    db.prepare(
      "UPDATE media SET status = 'probed', codec = ?, duration = ?, width = ?, height = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(info.codec, info.duration, info.width, info.height, media.id);

    if (info.codec === 'h264' && media.path.toLowerCase().endsWith('.mp4')) {
      logger.info(`[transcode] Already H.264 MP4, marking ready`);
      db.prepare("UPDATE media SET status = 'ready', updated_at = datetime('now') WHERE id = ?").run(media.id);
      return;
    }

    const dir = path.dirname(media.path);
    const base = path.basename(media.path, path.extname(media.path));
    const suffix = media.path.toLowerCase().endsWith('.mp4') ? '_h264' : '';
    const outputPath = path.join(dir, `${base}${suffix}.mp4`);

    logger.info(`[transcode] Transcoding → ${outputPath}`);
    db.prepare("UPDATE media SET status = 'transcoding', updated_at = datetime('now') WHERE id = ?").run(media.id);

    await transcode(media.path, outputPath);

    db.prepare(
      "UPDATE media SET status = 'ready', transcoded_path = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(outputPath, media.id);

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
        resolve({
          duration: parseFloat(out.format?.duration) || 0,
          width: video?.width || 0,
          height: video?.height || 0,
          codec: video?.codec_name || 'unknown',
        });
      } catch (e) {
        reject(new Error(`Failed to parse ffprobe output: ${e.message}`));
      }
    });
    proc.on('error', err => reject(new Error(`Failed to spawn ffprobe: ${err.message}`)));
  });
}

function transcode(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-i', inputPath,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '23',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',
      '-y', outputPath,
    ];
    const proc = spawn(ffmpegPath, args);
    proc.on('close', code => {
      if (code !== 0) reject(new Error(`ffmpeg exited with code ${code}`));
      else resolve(outputPath);
    });
    proc.on('error', err => reject(new Error(`Failed to spawn ffmpeg: ${err.message}`)));
  });
}
