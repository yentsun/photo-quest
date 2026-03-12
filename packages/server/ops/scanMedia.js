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
import { SUPPORTED_EXTENSIONS, IMAGE_EXTENSIONS, JOB_TYPE, MEDIA_TYPE, MEDIA_STATUS, SCAN_STATUS, IMPORT_STATUS } from '@photo-quest/shared';
import { saveDb } from '../src/db.js';
import { broadcastSse } from '../src/sse.js';

/**
 * Compute a content hash for a file.
 * Uses first 64KB + file size for reliable identification (LAW 1.24).
 * Async with timeout to avoid hanging on cloud-synced files.
 */
async function computeFileHash(filePath, timeoutMs = 5000) {
  const stat = fs.statSync(filePath);
  const chunkSize = Math.min(65536, stat.size);

  const buffer = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('File read timed out'));
    }, timeoutMs);

    const chunks = [];
    let read = 0;
    const stream = fs.createReadStream(filePath, { start: 0, end: chunkSize - 1 });
    stream.on('data', (chunk) => {
      chunks.push(chunk);
      read += chunk.length;
      if (read >= chunkSize) stream.destroy();
    });
    stream.on('end', () => { clearTimeout(timer); resolve(Buffer.concat(chunks)); });
    stream.on('close', () => { clearTimeout(timer); resolve(Buffer.concat(chunks)); });
    stream.on('error', (err) => { clearTimeout(timer); reject(err); });
  });

  const hash = crypto.createHash('sha256');
  hash.update(buffer);
  hash.update(String(stat.size));
  return hash.digest('hex').substring(0, 32);
}

/**
 * Process a single import queue item: hash, dedup, insert media record.
 * Exported for testing.
 */
export async function processOneItem(db, itemId, filePath, logger) {
  const ext = path.extname(filePath).toLowerCase();

  /* Skip files with unsupported extensions (LAW 1.31). */
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    db.run(
      'UPDATE import_queue SET status = ?, error = ? WHERE id = ?',
      [IMPORT_STATUS.FAILED, 'Unsupported file type', itemId]
    );
    return;
  }

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

  const hash = await computeFileHash(filePath);

  /* Ensure folder has a record in the folders table. */
  db.run('INSERT OR IGNORE INTO folders (path) VALUES (?)', [folder]);

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
       updated_at = datetime("now") WHERE id = ?`,
      [filePath, folder, hiddenId]
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
        `INSERT INTO media (path, title, type, folder, status, hash)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [filePath, title, mediaType, folder, status, hash]
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
 * Uses setTimeout to yield to the event loop between batches.
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

  const progressStmt = db.prepare('SELECT total, processed FROM scans WHERE id = ?');
  progressStmt.bind([scanId]);
  progressStmt.step();
  const progress = progressStmt.getAsObject();
  progressStmt.free();

  logger.debug(`[scan ${scanId}] ${progress.processed}/${progress.total} ${item.path}`);

  /* Save to disk and broadcast every 50 items (or on last item). */
  if (progress.processed % 50 === 0 || progress.processed === progress.total) {
    saveDb();
  }

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
