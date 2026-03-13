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
    const row = kojo.ops.getMediaById(Number(params.id));

    if (!row) {
      return json(res, 404, { error: 'Media not found' });
    }

    const result = { exists: false, readable: false, size: null, ok: false };

    try {
      const stat = fs.statSync(row.path);
      result.exists = true;
      result.size = stat.size;

      /* Try reading first 1KB with a 3s timeout to confirm accessibility. */
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
    } catch (err) {
      result.error = err.message;
    }

    json(res, 200, result);
  });
};
