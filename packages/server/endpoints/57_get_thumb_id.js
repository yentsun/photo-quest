/**
 * @file GET /thumb/:id -- Serve a thumbnail image for any media item.
 *
 * Images: resize to 400 px wide via sharp (EXIF-rotated), cache as JPEG to disk.
 * Videos: extract a frame via ffmpeg, cache it as a JPEG to disk.
 *
 * A `?time=<seconds>` query parameter can be used for videos to extract a frame
 * at a specific offset. The generated JPEG is written to
 * packages/server/thumbs/<id>.jpg (or <id>_<time>.jpg when a time offset is
 * requested) on the first request and served from disk thereafter.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegBin from 'ffmpeg-static';
import sharp from 'sharp';
import { MEDIA_TYPE } from '@photo-quest/shared';
import { json } from '../src/http.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const THUMBS_DIR = path.join(__dirname, '..', 'thumbs');

/** In-flight generation promises keyed by media ID + optional time — prevents duplicate work on concurrent requests. */
const inFlight = new Map();

function extractFrame(videoPath, thumbPath, time = null) {
  const args = [
    '-hide_banner',
    '-loglevel', 'error',
  ];
  if (time != null) {
    args.push('-ss', String(time));
  }
  args.push('-i', videoPath, '-vframes', '1', '-an', '-y', thumbPath);

  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegBin, args);
    const stderrChunks = [];
    proc.stderr.on('data', (chunk) => stderrChunks.push(chunk));
    proc.on('close', (code) => {
      if (code !== 0) {
        const errOutput = Buffer.concat(stderrChunks).toString().slice(-600);
        reject(new Error(`ffmpeg exited ${code}: ${errOutput}`));
      } else {
        resolve();
      }
    });
    proc.on('error', reject);
  });
}

function generateImageThumb(imagePath, thumbPath) {
  return sharp(imagePath)
    .rotate()                                  // EXIF auto-rotate
    .resize({ width: 400, withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toFile(thumbPath);
}

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'GET',
    pathname: '/thumb/:id',
  }, async (req, res, params) => {
    const mediaId = Number(params.id);
    const row = kojo.ops.getMediaById(mediaId);

    if (!row) return json(res, 404, { error: 'Media not found' });

    const url = new URL(req.url, `http://${req.headers.host}`);
    const timeParam = url.searchParams.get('time');
    const requestedTime = timeParam != null ? Number(timeParam) : null;
    const effectiveTime = requestedTime != null
      ? requestedTime
      : (row.type === MEDIA_TYPE.VIDEO ? row.thumbnail_time : null);
    const time = effectiveTime != null ? Number(effectiveTime) : null;
    const useTime = time != null && Number.isFinite(time) && time >= 0 && row.type === MEDIA_TYPE.VIDEO;

    /* GIFs: serve raw so animation is preserved — no JPEG conversion. */
    if (path.extname(row.path).toLowerCase() === '.gif') {
      if (!fs.existsSync(row.path)) return json(res, 404, { error: 'File not found on disk' });
      const stat = fs.statSync(row.path);
      res.writeHead(200, {
        'Content-Type': 'image/gif',
        'Content-Length': stat.size,
        'Cache-Control': 'public, max-age=31536000',
      });
      return fs.createReadStream(row.path).pipe(res);
    }

    if (!fs.existsSync(THUMBS_DIR)) fs.mkdirSync(THUMBS_DIR, { recursive: true });

    const thumbFile = useTime ? `${mediaId}_${time}.jpg` : `${mediaId}.jpg`;
    const thumbPath = path.join(THUMBS_DIR, thumbFile);
    const inFlightKey = useTime ? `${mediaId}:${time}` : String(mediaId);

    if (!fs.existsSync(thumbPath)) {
      if (!fs.existsSync(row.path)) {
        return json(res, 404, { error: 'File not found on disk' });
      }

      let gen = inFlight.get(inFlightKey);
      if (!gen) {
        const work = row.type === MEDIA_TYPE.IMAGE
          ? generateImageThumb(row.path, thumbPath)
          : extractFrame(row.path, thumbPath, useTime ? time : null);
        gen = work.finally(() => inFlight.delete(inFlightKey));
        inFlight.set(inFlightKey, gen);
      }
      try {
        await gen;
      } catch (err) {
        logger.warn(`Thumb generation failed for media ${mediaId} time=${time}: ${err.message}`);
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('No thumbnail');
      }
    }

    const stat = fs.statSync(thumbPath);
    res.writeHead(200, {
      'Content-Type': 'image/jpeg',
      'Content-Length': stat.size,
      'Cache-Control': 'public, max-age=31536000',
    });
    fs.createReadStream(thumbPath).pipe(res);
  });
};
