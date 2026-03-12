/**
 * @file Scan a directory for media files using a database-backed import queue.
 *
 * Kojo op: accessed as `kojo.ops.scanMedia(dirPath)`.
 *
 * LAW 2.3: Media import uses a db-based queue. Files are discovered and queued
 * individually, progress is reported via SSE, and interrupted imports resume
 * automatically on restart.
 *
 * Two-phase approach:
 *  1. Discovery — walk the directory, insert each file into `import_queue`,
 *     create a `scans` record with the total count.
 *  2. Processing — work through queued items one at a time (hash, dedup,
 *     insert media, create probe job), broadcasting progress via SSE.
 *
 * @param {string} dirPath - Absolute path to the directory to scan.
 * @returns {{ scanId: number, total: number }}
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { SUPPORTED_EXTENSIONS, IMAGE_EXTENSIONS, JOB_TYPE, MEDIA_TYPE, MEDIA_STATUS, SCAN_STATUS, IMPORT_STATUS } from '@photo-quest/shared';
import { saveDb } from '../src/db.js';
import { broadcastSse } from '../src/sse.js';

/**
 * Compute a content hash for a file.
 * Uses first 64KB + file size for fast but reliable identification.
 */
function computeFileHash(filePath) {
  const stat = fs.statSync(filePath);
  const hash = crypto.createHash('sha256');

  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(Math.min(65536, stat.size));
  fs.readSync(fd, buffer, 0, buffer.length, 0);
  fs.closeSync(fd);

  hash.update(buffer);
  hash.update(String(stat.size));

  return hash.digest('hex').substring(0, 32);
}

/**
 * Extract EXIF metadata from an image using sharp.
 * Returns { orientation, width, height, camera, dateTaken } or nulls.
 */
async function extractExif(filePath) {
  try {
    const meta = await sharp(filePath).metadata();
    return {
      orientation: meta.orientation || null,
      width: meta.width || null,
      height: meta.height || null,
      camera: meta.exif ? parseCameraFromExif(meta) : null,
      dateTaken: meta.exif ? parseDateFromExif(meta) : null,
    };
  } catch {
    return { orientation: null, width: null, height: null, camera: null, dateTaken: null };
  }
}

/**
 * Try to parse camera model from sharp metadata.
 * Sharp doesn't directly expose EXIF tags, so we parse the raw EXIF buffer.
 */
function parseCameraFromExif(meta) {
  if (!meta.exif) return null;
  try {
    // Look for ASCII strings that match common camera model patterns
    const str = meta.exif.toString('ascii', 0, Math.min(meta.exif.length, 4096));
    // EXIF stores Make and Model as null-terminated ASCII strings
    // We'll extract readable substrings
    const readable = str.match(/[\x20-\x7E]{4,}/g) || [];
    // Camera models typically contain brand names
    const model = readable.find(s =>
      /fuji|canon|nikon|sony|olympus|panasonic|samsung|apple|google|huawei|xiaomi|dji|gopro|leica/i.test(s)
    );
    return model?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Try to parse date taken from EXIF buffer.
 * EXIF dates are in "YYYY:MM:DD HH:MM:SS" format.
 */
function parseDateFromExif(meta) {
  if (!meta.exif) return null;
  try {
    const str = meta.exif.toString('ascii', 0, Math.min(meta.exif.length, 4096));
    const match = str.match(/(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
    if (match) {
      return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Process a single import queue item: hash, dedup, insert media record.
 * Async because EXIF extraction uses sharp.
 * Exported for testing.
 */
export async function processOneItem(db, itemId, filePath, logger) {
  const ext = path.extname(filePath).toLowerCase();
  const title = path.basename(filePath, ext);
  const folder = path.dirname(filePath);
  const isImage = IMAGE_EXTENSIONS.includes(ext);
  const mediaType = isImage ? MEDIA_TYPE.IMAGE : MEDIA_TYPE.VIDEO;
  const status = isImage ? MEDIA_STATUS.READY : MEDIA_STATUS.PENDING;

  /* Check file still exists (may have been moved/deleted since discovery). */
  if (!fs.existsSync(filePath)) {
    db.run(
      'UPDATE import_queue SET status = ?, error = ? WHERE id = ?',
      [IMPORT_STATUS.FAILED, 'File not found', itemId]
    );
    return;
  }

  const hash = computeFileHash(filePath);

  /* Ensure folder has a record in the folders table. */
  db.run('INSERT OR IGNORE INTO folders (path) VALUES (?)', [folder]);

  /* Extract EXIF for images. */
  let exif = { orientation: null, width: null, height: null, camera: null, dateTaken: null };
  if (isImage) {
    exif = await extractExif(filePath);
  }

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
    db.run(
      `UPDATE media SET path = ?, folder = ?, hidden = 0,
       orientation = ?, camera = ?, date_taken = ?,
       width = COALESCE(width, ?), height = COALESCE(height, ?),
       updated_at = datetime("now") WHERE id = ?`,
      [filePath, folder, exif.orientation, exif.camera, exif.dateTaken,
       exif.width, exif.height, hiddenId]
    );
    logger.debug(`Restored media id=${hiddenId} at ${filePath}`);
  } else {
    /* Check if path already exists. */
    const existsStmt = db.prepare('SELECT id FROM media WHERE path = ?');
    existsStmt.bind([filePath]);
    const exists = existsStmt.step();
    existsStmt.free();

    if (exists) {
      db.run('UPDATE media SET hash = ? WHERE path = ? AND hash IS NULL', [hash, filePath]);
    } else {
      /* Insert new media. */
      db.run(
        `INSERT INTO media (path, title, type, folder, status, hash,
         orientation, width, height, camera, date_taken)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [filePath, title, mediaType, folder, status, hash,
         exif.orientation, exif.width, exif.height, exif.camera, exif.dateTaken]
      );

      /* Videos need a probe job. */
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
    }
  }

  /* Mark queue item as completed. */
  db.run(
    'UPDATE import_queue SET status = ? WHERE id = ?',
    [IMPORT_STATUS.COMPLETED, itemId]
  );
}

/**
 * Process the import queue for a given scan, one item at a time.
 * Uses setTimeout to avoid blocking the event loop.
 */
async function processQueue(kojo, scanId, logger) {
  const db = kojo.get('db');

  /* Claim next pending item for this scan. */
  const stmt = db.prepare(
    'SELECT id, path FROM import_queue WHERE scan_id = ? AND status = ? LIMIT 1'
  );
  stmt.bind([scanId, IMPORT_STATUS.PENDING]);
  const hasItem = stmt.step();

  if (!hasItem) {
    stmt.free();
    /* All done — mark scan as completed. */
    db.run(
      'UPDATE scans SET status = ? WHERE id = ?',
      [SCAN_STATUS.COMPLETED, scanId]
    );
    saveDb();

    /* Get final counts for the broadcast. */
    const countStmt = db.prepare('SELECT total, processed FROM scans WHERE id = ?');
    countStmt.bind([scanId]);
    countStmt.step();
    const scan = countStmt.getAsObject();
    countStmt.free();

    broadcastSse({ type: 'import_complete', scanId, total: scan.total, processed: scan.processed });
    logger.info(`Scan ${scanId} complete: ${scan.processed}/${scan.total} files imported`);
    return;
  }

  const item = stmt.getAsObject();
  stmt.free();

  try {
    await processOneItem(db, item.id, item.path, logger);
  } catch (err) {
    logger.warn(`Failed to import ${item.path}: ${err.message}`);
    db.run(
      'UPDATE import_queue SET status = ?, error = ? WHERE id = ?',
      [IMPORT_STATUS.FAILED, err.message, item.id]
    );
  }

  /* Increment processed count. */
  db.run('UPDATE scans SET processed = processed + 1 WHERE id = ?', [scanId]);
  saveDb();

  /* Broadcast progress. */
  const progressStmt = db.prepare('SELECT total, processed FROM scans WHERE id = ?');
  progressStmt.bind([scanId]);
  progressStmt.step();
  const progress = progressStmt.getAsObject();
  progressStmt.free();

  logger.debug(`[scan ${scanId}] ${progress.processed}/${progress.total} ${item.path}`);

  broadcastSse({
    type: 'import_progress',
    scanId,
    total: progress.total,
    processed: progress.processed
  });

  /* Schedule next item (yield to event loop). */
  setTimeout(() => processQueue(kojo, scanId, logger), 0);
}

/**
 * Resume any incomplete scans found in the database.
 * Called at boot time to satisfy LAW 2.3 resume requirement.
 */
export function resumeIncompleteScans(kojo, logger) {
  const db = kojo.get('db');
  const stmt = db.prepare(
    'SELECT id FROM scans WHERE status IN (?, ?)'
  );
  stmt.bind([SCAN_STATUS.DISCOVERING, SCAN_STATUS.IMPORTING]);

  const scanIds = [];
  while (stmt.step()) {
    scanIds.push(stmt.getAsObject().id);
  }
  stmt.free();

  for (const scanId of scanIds) {
    db.run('UPDATE scans SET status = ? WHERE id = ?', [SCAN_STATUS.IMPORTING, scanId]);
    saveDb();
    logger.info(`Resuming incomplete scan ${scanId}`);
    setTimeout(() => processQueue(kojo, scanId, logger), 0);
  }
}

/**
 * Create folder records for the scan root and all intermediate directories.
 * This ensures the full folder hierarchy is navigable, not just leaf dirs.
 */
function createFolderHierarchy(db, scanRoot, files) {
  const dirs = new Set();
  dirs.add(scanRoot);

  for (const filePath of files) {
    let current = path.dirname(filePath);
    while (current.length >= scanRoot.length && current !== path.dirname(current)) {
      dirs.add(current);
      if (current === scanRoot) break;
      current = path.dirname(current);
    }
  }

  for (const dir of dirs) {
    db.run('INSERT OR IGNORE INTO folders (path) VALUES (?)', [dir]);
  }
}

export default function (dirPath) {
  const [kojo, logger] = this;
  const db = kojo.get('db');

  dirPath = dirPath.replace(/^["']+|["']+$/g, '').trim();

  if (!fs.existsSync(dirPath)) {
    throw new Error(`Directory not found: ${dirPath}`);
  }

  const stat = fs.statSync(dirPath);
  if (!stat.isDirectory()) {
    throw new Error(`Not a directory: ${dirPath}`);
  }

  /* Phase 1: Discovery — walk directory and populate import queue. */
  const files = findMediaFiles(dirPath);

  /* Create folder hierarchy — scan root + all intermediate directories. */
  createFolderHierarchy(db, dirPath, files);

  /* Create scan record. */
  db.run(
    'INSERT INTO scans (dir_path, total, status) VALUES (?, ?, ?)',
    [dirPath, files.length, SCAN_STATUS.DISCOVERING]
  );
  const idStmt = db.prepare('SELECT last_insert_rowid() as id');
  idStmt.step();
  const scanId = idStmt.getAsObject().id;
  idStmt.free();

  /* Queue each file as an import task. */
  const insertStmt = db.prepare(
    'INSERT INTO import_queue (scan_id, path, status) VALUES (?, ?, ?)'
  );
  for (const filePath of files) {
    insertStmt.bind([scanId, filePath, IMPORT_STATUS.PENDING]);
    insertStmt.step();
    insertStmt.reset();
  }
  insertStmt.free();

  /* Mark scan as ready for importing. */
  db.run('UPDATE scans SET status = ? WHERE id = ?', [SCAN_STATUS.IMPORTING, scanId]);
  saveDb();

  logger.info(`Scan ${scanId}: discovered ${files.length} files, starting import`);

  broadcastSse({
    type: 'import_started',
    scanId,
    total: files.length,
    processed: 0
  });

  /* Phase 2: Async queue processing. */
  setTimeout(() => processQueue(kojo, scanId, logger), 0);

  return { scanId, total: files.length };
}

/**
 * Recursively find all files with a supported media extension.
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
