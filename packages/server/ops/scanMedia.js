/**
 * @file Scan a directory for media files and register them in the database.
 *
 * Kojo op: accessed as `kojo.ops.scanMedia(dirPath)`.
 *
 * Recursively walks the given directory, finds files with supported media
 * extensions (both video and image), inserts new ones into the `media` table.
 * For videos, creates a `probe` job so the worker will extract metadata.
 * For images, sets status directly to 'ready' (no processing needed).
 *
 * Uses content hashing to identify media across different paths. If a hidden
 * media item with matching hash is found, it's restored instead of creating
 * a duplicate.
 *
 * @param {string} dirPath - Absolute path to the directory to scan.
 * @returns {{ scanned: number, added: number, restored: number }}
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { SUPPORTED_EXTENSIONS, IMAGE_EXTENSIONS, JOB_TYPE, MEDIA_TYPE, MEDIA_STATUS } from '@photo-quest/shared';
import { saveDb } from '../src/db.js';

/**
 * Compute a content hash for a file.
 * Uses first 64KB + file size for fast but reliable identification.
 */
function computeFileHash(filePath) {
  const stat = fs.statSync(filePath);
  const hash = crypto.createHash('sha256');

  // Read first 64KB
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(Math.min(65536, stat.size));
  fs.readSync(fd, buffer, 0, buffer.length, 0);
  fs.closeSync(fd);

  hash.update(buffer);
  hash.update(String(stat.size)); // Include file size for uniqueness

  return hash.digest('hex').substring(0, 32); // 32 char hash
}

export default function (dirPath) {
  const [kojo, logger] = this;
  const db = kojo.get('db');

  if (!fs.existsSync(dirPath)) {
    throw new Error(`Directory not found: ${dirPath}`);
  }

  const stat = fs.statSync(dirPath);
  if (!stat.isDirectory()) {
    throw new Error(`Not a directory: ${dirPath}`);
  }

  /* Find all media files recursively. */
  const files = findMediaFiles(dirPath);
  let added = 0;
  let restored = 0;

  for (const filePath of files) {
    const ext = path.extname(filePath).toLowerCase();
    const title = path.basename(filePath, ext);
    const folder = path.dirname(filePath);
    const isImage = IMAGE_EXTENSIONS.includes(ext);
    const mediaType = isImage ? MEDIA_TYPE.IMAGE : MEDIA_TYPE.VIDEO;
    const status = isImage ? MEDIA_STATUS.READY : MEDIA_STATUS.PENDING;

    try {
      /* Compute content hash for identification. */
      const hash = computeFileHash(filePath);

      /* Check if hidden media with same hash exists (restore case). */
      const hiddenStmt = db.prepare('SELECT id FROM media WHERE hash = ? AND hidden = 1');
      hiddenStmt.bind([hash]);
      const hasHidden = hiddenStmt.step();
      let hiddenId = null;
      if (hasHidden) {
        hiddenId = hiddenStmt.getAsObject().id;
      }
      hiddenStmt.free();

      if (hiddenId) {
        /* Restore hidden media with new path. */
        db.run(
          'UPDATE media SET path = ?, folder = ?, hidden = 0, updated_at = datetime("now") WHERE id = ?',
          [filePath, folder, hiddenId]
        );
        restored++;
        logger.debug(`Restored media id=${hiddenId} at ${filePath}`);
        continue;
      }

      /* Check if path already exists. */
      const existsStmt = db.prepare('SELECT id FROM media WHERE path = ?');
      existsStmt.bind([filePath]);
      const exists = existsStmt.step();
      existsStmt.free();

      if (exists) {
        /* Path exists, just update hash if missing. */
        db.run('UPDATE media SET hash = ? WHERE path = ? AND hash IS NULL', [hash, filePath]);
        continue;
      }

      /* Insert new media. */
      db.run(
        'INSERT INTO media (path, title, type, folder, status, hash) VALUES (?, ?, ?, ?, ?, ?)',
        [filePath, title, mediaType, folder, status, hash]
      );
      added++;

      /* Videos need a probe job to extract metadata. */
      if (!isImage) {
        const idStmt = db.prepare('SELECT last_insert_rowid() as id');
        idStmt.step();
        const mediaId = idStmt.getAsObject().id;
        idStmt.free();

        db.run(
          "INSERT INTO jobs (media_id, type, status) VALUES (?, ?, 'pending')",
          [mediaId, JOB_TYPE.PROBE]
        );
      }
    } catch (err) {
      logger.warn(`Failed to process ${filePath}: ${err.message}`);
    }
  }

  /* Persist all changes to disk so the worker can see them. */
  saveDb();

  logger.info(`Scanned ${files.length} files, added ${added} new, restored ${restored}`);
  return { scanned: files.length, added, restored };
}

/**
 * Recursively find all files with a supported media extension.
 *
 * @param {string} dirPath - The directory to search.
 * @returns {string[]} Array of absolute file paths.
 */
function findMediaFiles(dirPath) {
  const results = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      results.push(...findMediaFiles(fullPath));
    } else if (SUPPORTED_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())) {
      results.push(fullPath);
    }
  }

  return results;
}
