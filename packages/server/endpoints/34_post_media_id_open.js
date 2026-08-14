/**
 * @file POST /media/:id/open -- Open the media file in the OS default player.
 *
 * Resolves the on-disk file (transcoded output when present, otherwise the
 * original path) and hands it to the system's default associated application.
 */

import { spawn } from 'node:child_process';
import { json } from '../src/http.js';

function openFile(filePath) {
  if (process.platform === 'win32') {
    const ps = `Start-Process -FilePath '${filePath.replace(/'/g, "''")}'`;
    return spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps]);
  }
  if (process.platform === 'darwin') {
    return spawn('open', [filePath]);
  }
  return spawn('xdg-open', [filePath]);
}

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'POST',
    pathname: '/media/:id/open',
  }, (req, res, params) => {
    const db = kojo.get('db');
    const media = db.prepare('SELECT * FROM media WHERE id = ?').get(Number(params.id));
    if (!media) {
      json(res, 404, { error: 'Media not found' });
      return;
    }

    const filePath = media.transcoded_path || media.path;
    logger.info(`[POST /media/:id/open] opening ${filePath}`);

    let responded = false;
    const proc = openFile(filePath);
    proc.on('error', (err) => {
      if (responded) return;
      responded = true;
      logger.error(`[POST /media/:id/open] failed: ${err.message}`);
      json(res, 500, { error: 'Could not open file' });
    });
    proc.on('close', () => {
      if (responded) return;
      responded = true;
      json(res, 200, { ok: true });
    });
  });
};
