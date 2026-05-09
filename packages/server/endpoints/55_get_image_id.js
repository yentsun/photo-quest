/**
 * @file GET /image/:id -- Serve a still-image preview for any media.
 *
 * Kojo endpoint: registers route via the addHttpRoute op.
 *
 * For image media: serves the file with EXIF auto-rotation (LAW 2.3 / 2.4).
 * For video media: serves the extracted first frame as JPEG so thumbnail
 * UIs can render videos as still frames (and the PWA can cache them as
 * blobs for offline). Frames are extracted lazily on first request and
 * cached to disk under THUMBS_DIR.
 */

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { spawn } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import { MEDIA_TYPE } from '@photo-quest/shared';
import { json } from '../src/http.js';

const THUMBS_DIR = process.env.THUMBS_DIR || path.join(process.cwd(), 'thumbs');
/* Bundled ffmpeg binary (no system install required); fall back to PATH
 * lookup if the dependency is unavailable for the current platform. */
const FFMPEG_BIN = ffmpegStatic || 'ffmpeg';

const IMAGE_MIMES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.heic': 'image/jpeg',
  '.jfif': 'image/jpeg',
};

/**
 * Extract the first frame of `videoPath` to `thumbPath` via ffmpeg. Resolves
 * once the file is on disk; rejects if ffmpeg fails. `-frames:v 1` grabs a
 * single frame and `-q:v 3` keeps quality high (lower = better, 2-5 typical).
 */
function extractFirstFrame(videoPath, thumbPath) {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_BIN, [
      '-y',
      '-i', videoPath,
      '-frames:v', '1',
      '-q:v', '3',
      thumbPath,
    ]);
    proc.on('close', code => code === 0
      ? resolve()
      : reject(new Error(`ffmpeg exit ${code}`)));
    proc.on('error', err => reject(new Error(`ffmpeg spawn: ${err.message}`)));
  });
}

async function ensureVideoThumb(mediaId, videoPath) {
  if (!fs.existsSync(THUMBS_DIR)) fs.mkdirSync(THUMBS_DIR, { recursive: true });
  const thumbPath = path.join(THUMBS_DIR, `${mediaId}.jpg`);
  if (fs.existsSync(thumbPath)) return thumbPath;
  await extractFirstFrame(videoPath, thumbPath);
  return thumbPath;
}

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'GET',
    pathname: '/image/:id',
  }, async (req, res, params) => {
    const id = Number(params.id);
    const row = kojo.ops.getMediaById(id);

    if (!row) {
      return json(res, 404, { error: 'Media not found' });
    }

    if (!fs.existsSync(row.path)) {
      return json(res, 404, { error: 'File not found on disk' });
    }

    /* Video: serve the cached first-frame JPEG (extract on first hit). */
    if (row.type === MEDIA_TYPE.VIDEO) {
      let thumbPath;
      try {
        thumbPath = await ensureVideoThumb(id, row.path);
      } catch (err) {
        logger.error(`Failed to extract thumb for ${row.path}: ${err.message}`);
        return json(res, 500, { error: 'Thumbnail extraction failed' });
      }
      const stat = fs.statSync(thumbPath);
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000',
      });
      const stream = fs.createReadStream(thumbPath);
      stream.on('error', (err) => {
        logger.error(`Stream error for ${thumbPath}: ${err.message}`);
        res.destroy(err);
      });
      return stream.pipe(res);
    }

    const ext = path.extname(row.path).toLowerCase();
    const contentType = IMAGE_MIMES[ext] || 'image/jpeg';

    /* Always run through sharp.rotate() which auto-rotates based on EXIF.
     * It's a no-op when no rotation is needed, and avoids relying on the
     * stored orientation value which may be stale or incorrect. */
    try {
      const buffer = await sharp(row.path)
        .rotate() // auto-rotate based on EXIF
        .toBuffer();

      res.writeHead(200, {
        'Content-Length': buffer.length,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000',
      });
      return res.end(buffer);
    } catch (err) {
      logger.error(`Failed to process image ${row.path}: ${err.message}`);
    }

    /* Fallback: serve raw file if sharp fails. */
    const stat = fs.statSync(row.path);
    res.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000',
    });
    const stream = fs.createReadStream(row.path);
    stream.on('error', (err) => {
      logger.error(`Stream error for ${row.path}: ${err.message}`);
      res.destroy(err);
    });
    stream.pipe(res);
  });
};
