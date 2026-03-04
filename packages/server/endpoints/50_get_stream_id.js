/**
 * @file GET /stream/:id -- Stream a media file with HTTP Range support.
 *
 * Kojo endpoint: registers route via the addHttpRoute op.
 *
 * Supports the HTTP Range protocol (RFC 7233) so browsers and video players
 * can seek to any position without downloading the entire file first.
 *
 * Flow:
 *  1. Look up the media record to find the file path on disk.
 *  2. If a transcoded version exists (in `transcoded/` dir), serve that.
 *  3. Otherwise serve the original file.
 *  4. Parse the Range header and respond with 206 Partial Content, or
 *     200 OK if no Range header was sent.
 */

import fs from 'node:fs';
import path from 'node:path';
import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'GET',
    pathname: '/stream/:id',
  }, (req, res, params) => {
    const row = kojo.ops.getMediaById(Number(params.id));

    if (!row) {
      return json(res, 404, { error: 'Media not found' });
    }

    /* Prefer the transcoded file if it exists, fall back to original. */
    const transcodedPath = path.join(
      path.dirname(row.path),
      'transcoded',
      path.basename(row.path, path.extname(row.path)) + '.mp4'
    );
    const filePath = fs.existsSync(transcodedPath) ? transcodedPath : row.path;

    if (!fs.existsSync(filePath)) {
      return json(res, 404, { error: 'File not found on disk' });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;

    /* Determine MIME type from extension. */
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mkv': 'video/x-matroska',
      '.avi': 'video/x-msvideo',
      '.mov': 'video/quicktime',
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    const rangeHeader = req.headers.range;

    if (rangeHeader) {
      /* Parse "bytes=START-END" (END is optional). */
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      /* Validate range bounds. */
      if (start >= fileSize || end >= fileSize || start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
        return res.end();
      }

      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
      });

      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      /* No Range header -- send the entire file. */
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
      });

      fs.createReadStream(filePath).pipe(res);
    }
  });
};
