/**
 * @file POST /media/upload -- Accept file uploads from mobile clients.
 *
 * Kojo endpoint: registers route via the addHttpRoute op.
 * Expects JSON body: { fileName, mimeType, data: base64string }
 *
 * Phase 7 of issue #27.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { json, parseBody } from '../src/http.js';

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(os.homedir(), 'PhotoQuest', 'Uploads');

export default async (kojo, logger) => {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  kojo.ops.addHttpRoute({
    method: 'POST',
    pathname: '/media/upload',
  }, async (req, res) => {
    const body = await parseBody(req);

    if (!body || !body.fileName || !body.data) {
      return json(res, 400, { error: 'Missing required fields: fileName, data' });
    }

    try {
      const sanitized = body.fileName.replace(/[<>:"/\\|?*]/g, '_');
      const filePath = path.join(UPLOAD_DIR, sanitized);
      const buffer = Buffer.from(body.data, 'base64');

      if (fs.existsSync(filePath)) {
        return json(res, 409, { error: `File already exists: ${sanitized}` });
      }

      fs.writeFileSync(filePath, buffer);
      logger.info(`Uploaded: ${sanitized} (${(buffer.length / 1024).toFixed(1)} KB)`);

      const result = kojo.ops.scanMedia(filePath.startsWith(UPLOAD_DIR) ? UPLOAD_DIR : path.dirname(filePath));

      json(res, 200, { ok: true, fileName: sanitized, scanId: result.scanId });
    } catch (err) {
      logger.error(`Upload failed: ${err.message}`);
      json(res, 500, { error: err.message });
    }
  });
};
