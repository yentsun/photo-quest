/**
 * @file Add media items from client-side folder scan.
 *
 * Kojo op: accessed as `kojo.ops.addMedia(folderId, folderName, files)`.
 *
 * Receives media metadata from client-side File System Access API scans.
 * Files are served client-side via blob URLs, so we only store metadata.
 * Path format: `folderId:relativePath` to distinguish from server-scanned paths.
 *
 * @param {string} folderId - Client-generated folder ID (e.g., "folder-1709712345678")
 * @param {string} folderName - Display name of the folder
 * @param {Array<{name: string, path: string}>} files - Array of file info
 * @returns {{ added: number }}
 */

import path from 'node:path';
import { IMAGE_EXTENSIONS, MEDIA_TYPE, MEDIA_STATUS } from '@photo-quest/shared';
import { saveDb } from '../src/db.js';

export default function (folderId, folderName, files) {
  const [kojo, logger] = this;
  const db = kojo.get('db');

  let added = 0;

  for (const file of files) {
    const ext = path.extname(file.name).toLowerCase();
    const title = path.basename(file.name, ext);
    const isImage = IMAGE_EXTENSIONS.includes(ext);
    const mediaType = isImage ? MEDIA_TYPE.IMAGE : MEDIA_TYPE.VIDEO;

    // For client-side scanned files, path format is "folderId:relativePath"
    // This distinguishes them from server-scanned absolute paths
    const mediaPath = `${folderId}:${file.path}`;

    try {
      db.run(
        'INSERT OR IGNORE INTO media (path, title, type, folder, status) VALUES (?, ?, ?, ?, ?)',
        [mediaPath, title, mediaType, folderName, MEDIA_STATUS.READY]
      );

      const changesStmt = db.prepare('SELECT changes() as c');
      changesStmt.step();
      const changes = changesStmt.getAsObject().c;
      changesStmt.free();

      if (changes > 0) {
        added++;
      }
    } catch (err) {
      logger.warn(`Failed to insert ${file.name}: ${err.message}`);
    }
  }

  saveDb();
  logger.info(`Added ${added} media items from folder "${folderName}"`);
  return { added };
}
