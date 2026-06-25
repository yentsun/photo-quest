/**
 * @file GET /media/:id/status -- Check if a media file is accessible on disk.
 *
 * Returns health info: whether the file exists, is readable, and file size.
 * Uses async reads with a timeout to avoid hanging on cloud-synced files.
 */

import fs from 'node:fs';
import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'GET',
    pathname: '/media/:id/status',
  }, async (req, res, params) => {
    logger.debug(`[GET /media/:id/status] id=${params.id}`);
    const row = kojo.ops.getMediaById(Number(params.id));

    if (!row) {
      logger.debug(`[GET /media/:id/status] not found: id=${params.id}`);
      return json(res, 404, { error: 'Media not found' });
    }

    logger.debug(`[GET /media/:id/status] checking path=${row.path}`);
    const result = { exists: false, readable: false, size: null, ok: false };

    try {
      const stat = fs.statSync(row.path);
      result.exists = true;
      result.size = stat.size;
      logger.debug(`[GET /media/:id/status] file exists size=${stat.size}, probing readability`);

      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Read timed out')), 3000);
        const stream = fs.createReadStream(row.path, { start: 0, end: Math.min(1023, stat.size - 1) });
        stream.on('data', () => {});
        stream.on('end', () => { clearTimeout(timer); resolve(); });
        stream.on('close', () => { clearTimeout(timer); resolve(); });
        stream.on('error', (err) => { clearTimeout(timer); reject(err); });
      });

      result.readable = true;
      result.ok = true;
      logger.debug(`[GET /media/:id/status] ok: id=${params.id}`);
    } catch (err) {
      result.error = err.message;
      logger.debug(`[GET /media/:id/status] error: ${err.message}`);
    }

    json(res, 200, result);
  });
};
