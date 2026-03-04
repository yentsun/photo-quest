/**
 * @file Scan a directory for media files and register them in the database.
 *
 * Kojo op: accessed as `kojo.ops.scanMedia(dirPath)`.
 *
 * Recursively walks the given directory, finds files with supported video
 * extensions, inserts new ones into the `media` table, and creates a
 * `probe` job for each new entry so the worker will extract metadata.
 *
 * @param {string} dirPath - Absolute path to the directory to scan.
 * @returns {{ scanned: number, added: number }}
 */

import fs from 'node:fs';
import path from 'node:path';
import { SUPPORTED_EXTENSIONS, JOB_TYPE } from '@photo-quest/shared';
import { saveDb } from '../src/db.js';

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

  for (const filePath of files) {
    const title = path.basename(filePath, path.extname(filePath));

    /* Try to insert -- ignore if the path already exists (UNIQUE constraint). */
    try {
      db.run(
        "INSERT OR IGNORE INTO media (path, title, status) VALUES (?, ?, 'pending')",
        [filePath, title]
      );

      /* Check if the row was actually inserted by looking at changes(). */
      const changesStmt = db.prepare('SELECT changes() as c');
      changesStmt.step();
      const changes = changesStmt.getAsObject().c;
      changesStmt.free();

      if (changes > 0) {
        /* Get the ID of the newly-inserted media row. */
        const idStmt = db.prepare('SELECT last_insert_rowid() as id');
        idStmt.step();
        const mediaId = idStmt.getAsObject().id;
        idStmt.free();

        /* Queue a probe job for this new media. */
        db.run(
          "INSERT INTO jobs (media_id, type, status) VALUES (?, ?, 'pending')",
          [mediaId, JOB_TYPE.PROBE]
        );
        added++;
      }
    } catch (err) {
      logger.warn(`Failed to insert ${filePath}: ${err.message}`);
    }
  }

  /* Persist all changes to disk so the worker can see them. */
  saveDb();

  logger.info(`Scanned ${files.length} files, added ${added} new`);
  return { scanned: files.length, added };
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
