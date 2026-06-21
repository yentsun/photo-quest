import fs from 'node:fs';
import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'POST',
    pathname: '/library/connect',
  }, async (req, res) => {
    const body = await req.json();
    const libraryPath = body?.path;

    if (!libraryPath) return json(res, 400, { error: 'path is required' });
    if (!fs.existsSync(libraryPath)) return json(res, 400, { error: 'File not found' });

    const settingsPath = kojo.get('settingsPath');
    if (!settingsPath) return json(res, 500, { error: 'Settings path not configured' });

    const settings = fs.existsSync(settingsPath)
      ? JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
      : {};

    settings.libraryPath = libraryPath;
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    logger.info(`Library changed to: ${libraryPath}`);
    json(res, 200, { ok: true });

    // Signal main process to relaunch with the new library
    process.parentPort?.postMessage({ type: 'relaunch' });
  });
};
