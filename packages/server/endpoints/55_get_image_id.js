/**
 * @file GET /image/:id -- Serve an image file.
 *
 * Kojo endpoint: registers route via the addHttpRoute op.
 *
 * Unlike video streaming, images are served in full without Range support
 * since they are typically small enough to load entirely.
 */

import fs from 'node:fs';
import path from 'node:path';
import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'GET',
    pathname: '/image/:id',
  }, (req, res, params) => {
    const row = kojo.ops.getMediaById(Number(params.id));

    if (!row) {
      return json(res, 404, { error: 'Media not found' });
    }

    const filePath = row.path;

    if (!fs.existsSync(filePath)) {
      return json(res, 404, { error: 'File not found on disk' });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;

    /* Determine MIME type from extension. */
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
      '.heic': 'image/heic',
      '.jfif': 'image/jpeg',
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000',
    });

    fs.createReadStream(filePath).pipe(res);
  });
};
