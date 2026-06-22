/**
 * @file POST /media/check-path -- Validate that a folder path exists and is a directory.
 * Returns validity and an estimate of new media files that would be added.
 */

import fs from 'node:fs';
import path from 'node:path';
import { SUPPORTED_EXTENSIONS } from '@photo-quest/shared';
import { json, parseBody } from '../src/http.js';

/**
 * Count media files recursively (quick scan, no hashing).
 */
function countMediaFiles(dirPath) {
  let total = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += countMediaFiles(full);
      } else if (SUPPORTED_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())) {
        total++;
      }
    }
  } catch {
    // skip unreadable dirs
  }
  return total;
}

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'POST',
    pathname: '/media/check-path',
  }, async (req, res) => {
    const body = await parseBody(req);

    if (!body || !body.path) {
      return json(res, 400, { valid: false, error: 'Missing path' });
    }

    const p = body.path.replace(/^["']+|["']+$/g, '').trim();

    if (!fs.existsSync(p)) {
      return json(res, 200, { valid: false, error: 'Path does not exist' });
    }

    const stat = fs.statSync(p);
    if (!stat.isDirectory()) {
      return json(res, 200, { valid: false, error: 'Not a directory' });
    }

    const db = kojo.get('db');
    const totalFiles = countMediaFiles(p);

    // Count how many are already in the db
    const { c: existing } = db.prepare('SELECT COUNT(*) as c FROM media WHERE folder = ? AND hidden = 0').get(p);

    return json(res, 200, { valid: true, files: totalFiles, newEstimate: Math.max(0, totalFiles - existing) });
  });
};
