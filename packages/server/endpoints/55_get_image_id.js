/**
 * @file GET /image/:id -- Serve an image file with EXIF rotation applied.
 *
 * Kojo endpoint: registers route via the addHttpRoute op.
 *
 * LAW 2.3: Photos must be displayed according to their EXIF orientation data.
 * Uses the orientation value stored in the DB during import (LAW 2.4).
 * Only processes through sharp when rotation is actually needed.
 */

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'GET',
    pathname: '/image/:id',
  }, async (req, res, params) => {
    const row = kojo.ops.getMediaById(Number(params.id));

    if (!row) {
      return json(res, 404, { error: 'Media not found' });
    }

    const filePath = row.path;

    if (!fs.existsSync(filePath)) {
      return json(res, 404, { error: 'File not found on disk' });
    }

    /* Determine MIME type from extension. */
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
      '.heic': 'image/jpeg',
      '.jfif': 'image/jpeg',
    };
    const contentType = mimeTypes[ext] || 'image/jpeg';

    /* Orientation 1 = normal, null = unknown/no EXIF.
     * Only run through sharp if rotation is needed. */
    const needsRotation = row.orientation && row.orientation !== 1;

    if (needsRotation) {
      try {
        const buffer = await sharp(filePath)
          .rotate() // auto-rotate based on EXIF
          .toBuffer();

        res.writeHead(200, {
          'Content-Length': buffer.length,
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000',
        });
        return res.end(buffer);
      } catch (err) {
        logger.error(`Failed to rotate image ${filePath}: ${err.message}`);
        /* Fall through to raw serving. */
      }
    }

    /* Serve raw file (no rotation needed or sharp failed). */
    const stat = fs.statSync(filePath);
    res.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000',
    });
    fs.createReadStream(filePath).pipe(res);
  });
};
