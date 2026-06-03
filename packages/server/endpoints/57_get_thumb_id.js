/**
 * @file GET /thumb/:id -- Serve a thumbnail image for any media item.
 *
 * Images: redirect to /image/:id (already handled by that endpoint).
 * Videos: extract the first frame via ffmpeg, cache it as a JPEG, and serve it.
 *
 * The generated JPEG is written to packages/server/thumbs/<id>.jpg on the first
 * request and served from disk on all subsequent requests.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegBin from 'ffmpeg-static';
import { MEDIA_TYPE } from '@photo-quest/shared';
import { json } from '../src/http.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const THUMBS_DIR = path.join(__dirname, '..', 'thumbs');

/** In-flight generation promises keyed by media ID — prevents duplicate ffmpeg spawns. */
const inFlight = new Map();

function extractFrame(videoPath, thumbPath) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegBin, [
      '-hide_banner',
      '-loglevel', 'error',
      '-i', videoPath,
      '-vframes', '1',
      '-an',
      '-y',
      thumbPath,
    ]);
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

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'GET',
    pathname: '/thumb/:id',
  }, async (req, res, params) => {
    const mediaId = Number(params.id);
    const row = kojo.ops.getMediaById(mediaId);

    if (!row) return json(res, 404, { error: 'Media not found' });

    if (row.type === MEDIA_TYPE.IMAGE) {
      res.writeHead(302, { Location: `/image/${mediaId}` });
      return res.end();
    }

    if (!fs.existsSync(THUMBS_DIR)) fs.mkdirSync(THUMBS_DIR, { recursive: true });

    const thumbPath = path.join(THUMBS_DIR, `${mediaId}.jpg`);

    if (!fs.existsSync(thumbPath)) {
      if (!fs.existsSync(row.path)) {
        return json(res, 404, { error: 'Video file not found' });
      }

      let gen = inFlight.get(mediaId);
      if (!gen) {
        gen = extractFrame(row.path, thumbPath).finally(() => inFlight.delete(mediaId));
        inFlight.set(mediaId, gen);
      }
      try {
        await gen;
      } catch (err) {
        logger.warn(`Thumb generation failed for media ${mediaId}: ${err.message}`);
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
