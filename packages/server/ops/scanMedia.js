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
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { SUPPORTED_EXTENSIONS, IMAGE_EXTENSIONS, MEDIA_TYPE, MEDIA_STATUS, SCAN_STATUS, IMPORT_STATUS } from '@photo-quest/shared';
import { broadcastSse } from '../src/sse.js';
import { DB_PATH } from '../src/db.js';
import { isMediaFile } from '../src/mediaFile.js';

const WORKER_PATH = process.env.SCAN_WORKER_PATH
  || path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/scanWorker.js');

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
  logger.debug(`itemId=${itemId} ext=${ext} path=${filePath}`);

  if (!isMediaFile(filePath)) {
    logger.debug(`unsupported file "${filePath}", marking failed`);
    db.prepare(
      'UPDATE import_queue SET status = ?, error = ? WHERE id = ?'
    ).run(IMPORT_STATUS.FAILED, 'Unsupported file type', itemId);
    return;
  }

  const title = path.basename(filePath, ext);
  const folder = path.dirname(filePath);
  const isImage = IMAGE_EXTENSIONS.includes(ext);
  const mediaType = isImage ? MEDIA_TYPE.IMAGE : MEDIA_TYPE.VIDEO;
  const status = isImage ? MEDIA_STATUS.READY : MEDIA_STATUS.PENDING;
  logger.debug(`type=${mediaType} status=${status} title="${title}"`);

  if (!fs.existsSync(filePath)) {
    logger.debug(`file not found on disk, marking failed`);
    db.prepare(
      'UPDATE import_queue SET status = ?, error = ? WHERE id = ?'
    ).run(IMPORT_STATUS.FAILED, 'File not found', itemId);
    return;
  }

  const fileStat = fs.statSync(filePath);
  const dateTaken = fileStat.mtime.toISOString();

  const existing = db.prepare('SELECT id FROM media WHERE path = ? AND hidden = 0').get(filePath);
  if (existing) {
    logger.debug(`fast-path: already in library as id=${existing.id}, updating date_taken`);
    db.prepare('UPDATE media SET date_taken = ? WHERE id = ? AND date_taken IS NULL').run(dateTaken, existing.id);
    db.prepare('UPDATE import_queue SET status = ? WHERE id = ?').run(IMPORT_STATUS.COMPLETED, itemId);
    return;
  }

  logger.debug(`computing hash for ${filePath}`);
  const hash = await computeFileHash(filePath);
  logger.debug(`hash=${hash}`);

  db.prepare('INSERT OR IGNORE INTO folders (path) VALUES (?)').run(folder);

  const hidden = db.prepare('SELECT id FROM media WHERE hash = ? AND hidden = 1').get(hash);

  if (hidden) {
    logger.debug(`restoring hidden media id=${hidden.id} with same hash`);
    db.prepare(
      `UPDATE media SET path = ?, folder = ?, hidden = 0, date_taken = ?,
       updated_at = datetime('now') WHERE id = ?`
    ).run(filePath, folder, dateTaken, hidden.id);
    logger.debug(`Restored media id=${hidden.id} at ${filePath}`);
  } else {
    const exists = db.prepare('SELECT id FROM media WHERE path = ?').get(filePath);

    if (exists) {
      logger.debug(`path exists with id=${exists.id}, patching hash`);
      db.prepare('UPDATE media SET hash = ?, date_taken = ? WHERE path = ? AND (hash IS NULL OR date_taken IS NULL)').run(hash, dateTaken, filePath);
    } else {
      logger.debug(`inserting new media record`);
      const result = db.prepare(
        `INSERT INTO media (path, title, type, folder, status, hash, date_taken)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(filePath, title, mediaType, folder, status, hash, dateTaken);
      logger.debug(`inserted media id=${result.lastInsertRowid}`);
    }
  }

  db.prepare(
    'UPDATE import_queue SET status = ? WHERE id = ?'
  ).run(IMPORT_STATUS.COMPLETED, itemId);
  logger.debug(`completed itemId=${itemId}`);
}

/** The single active scan worker, or null when idle. */
let activeWorker = null;

/**
 * Abort controllers for scans currently in the discovery (disk-walk) phase,
 * keyed by scan id. The cancel endpoint aborts these so the synchronous-ish
 * walk can be interrupted between directory reads. Discovery is the phase that
 * previously ran on the request thread and blocked the event loop, making
 * `/scans/:id/cancel` unserviceable.
 */
const discoveryAborts = new Map();

/** Terminate the worker immediately. No-op if idle. */
export function terminateAllScanWorkers() {
  if (activeWorker) {
    activeWorker.terminate();
    activeWorker = null;
  }
}

/**
 * Abort any scan still in the discovery (disk-walk) phase.
 * No-op if no discovery is in progress. Called by the cancel endpoint so the
 * walk stops promptly rather than finishing the entire tree first.
 */
export function abortDiscoveryWalk() {
  for (const controller of discoveryAborts.values()) {
    controller.abort();
  }
  discoveryAborts.clear();
}

/**
 * Ensure the single worker thread is running.
 * If it is already running it will naturally pick up items from the new
 * scan that were just added to import_queue — no second thread needed.
 */
function ensureScanWorker(logger) {
  if (activeWorker) return;

  const worker = new Worker(WORKER_PATH, { workerData: { dbPath: DB_PATH } });
  activeWorker = worker;

  worker.on('message', (msg) => {
    if (msg.type === 'sse') broadcastSse(msg.event);
    if (msg.type === 'log') logger[msg.level]?.(msg.msg);
  });
  worker.on('error', (err) => {
    activeWorker = null;
    logger.warn(`Scan worker error: ${err.message}`);
  });
  worker.on('exit', () => { activeWorker = null; });
}

/**
 * Resume any incomplete scans found in the database.
 * Called at boot time to satisfy LAW 2.3 resume requirement.
 */
export function resumeIncompleteScans(kojo, logger) {
  const db = kojo.get('db');
  const scans = db.prepare(
    'SELECT id FROM scans WHERE status IN (?, ?)'
  ).all(SCAN_STATUS.DISCOVERING, SCAN_STATUS.IMPORTING);

  if (scans.length === 0) return;

  /* Cancel all stale scans rather than resuming them. With path-based
     deduplication, rescans are fast — the user can re-trigger if needed.
     Resuming accumulates workers on every restart and was the cause of
     dozens of redundant workers spawning. */
  const stmt = db.prepare('UPDATE scans SET status = ? WHERE id = ?');
  for (const scan of scans) {
    stmt.run(SCAN_STATUS.CANCELLED, scan.id);
  }
  logger.info(`Cancelled ${scans.length} incomplete scan(s) from previous session`);
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

  const insertFolder = db.prepare('INSERT OR IGNORE INTO folders (path) VALUES (?)');
  for (const dir of dirs) {
    insertFolder.run(dir);
  }
}

export default async function (dirPath) {
  const [kojo, logger] = this;
  const db = kojo.get('db');
  const t0 = performance.now();

  logger.debug(`dirPath="${dirPath}"`);
  dirPath = dirPath.replace(/^["']+|["']+$/g, '').trim();
  /* Normalise separators so the subtree prefix (built from dirPath with
     path.sep) matches the OS-normalised paths produced by path.join in
     findMediaFiles. Without this, a forward-slash dirPath on Windows would
     miss every stored path and re-queue the whole subtree (issue #40). */
  dirPath = path.normalize(dirPath);
  logger.debug(`trimmed dirPath="${dirPath}"`);

  if (!fs.existsSync(dirPath)) {
    logger.debug(`directory not found: ${dirPath}`);
    throw new Error(`Directory not found: ${dirPath}`);
  }

  const stat = fs.statSync(dirPath);
  if (!stat.isDirectory()) {
    logger.debug(`path is not a directory: ${dirPath}`);
    throw new Error(`Not a directory: ${dirPath}`);
  }

  /* Create the scan record up-front so the cancel endpoint can always find it
     by id and stop discovery, even while the (previously synchronous) disk
     walk is still running. Previously the record was only created after the
     walk, which left the walk uncancellable and blocked the event loop. */
  const scanResult = db.prepare(
    'INSERT INTO scans (dir_path, total, status) VALUES (?, 0, ?)'
  ).run(dirPath, SCAN_STATUS.DISCOVERING);
  const scanId = scanResult.lastInsertRowid;

  const abortController = new AbortController();
  discoveryAborts.set(scanId, abortController);

  logger.debug(`walking directory tree (scan ${scanId})`);
  let files;
  const tWalk = performance.now();
  try {
    files = await findMediaFiles(dirPath, abortController.signal);
  } catch (err) {
    if (err?.name === 'AbortError') {
      db.prepare('UPDATE scans SET status = ? WHERE id = ?').run(SCAN_STATUS.CANCELLED, scanId);
      /* The cancel endpoint already broadcasts import_cancelled after
         abortDiscoveryWalk(); don't emit a second event for the same scan. */
      logger.info(`discovery aborted: ${dirPath}`);
      return { scanId, total: 0, cancelled: true };
    }
    db.prepare('UPDATE scans SET status = ? WHERE id = ?').run(SCAN_STATUS.FAILED, scanId);
    throw err;
  } finally {
    discoveryAborts.delete(scanId);
  }
  logger.debug(`discovered ${files.length} media files on disk`);
  console.log(`[DBG][scan] WALK ${(performance.now() - tWalk).toFixed(0)}ms files=${files.length} dir=${dirPath}`);

  createFolderHierarchy(db, dirPath, files);

  /* Scope the path-diff to just this scanned subtree instead of loading every
     media path in the library (issue #40). Uses an index-usable prefix range:
     `path >= dirPrefix AND path < dirPrefix + maxChar`, which is wildcard-safe
     (`_`/`%` matched literally) and case-sensitive, consistent with the exact
     Set.has below. The exclusive upper bound sorts below siblings like
     `foo-bar` (since the separator `<` the next char), so only true
     descendants match. The .ts cleanup loop also benefits: it no longer
     iterates unrelated rows. */
  const dirPrefix = dirPath.endsWith(path.sep) ? dirPath : dirPath + path.sep;
  /* Highest Unicode code point — exclusive upper bound for the prefix range. */
  const dirPrefixUpper = dirPrefix + '\u{10FFFF}';

  const tRows = performance.now();
  const existingRows = db.prepare(
    'SELECT id, path FROM media WHERE hidden = 0 AND path >= ? AND path < ?'
  ).all(dirPrefix, dirPrefixUpper);
  const existingPaths = new Set(existingRows.map(r => r.path));
  console.log(`[DBG][scan] LOAD-SUBTREE-ROWS ${(performance.now() - tRows).toFixed(0)}ms rows=${existingRows.length}`);
  const newFiles = files.filter(f => !existingPaths.has(f));

  /* Remove records for files under this directory that were previously
     mis-detected as MPEG-TS videos but are actually text (.ts source files).
     Runs before the empty-directory early return so a directory whose only
     non-media files remain still gets cleaned up. */
  const deleteMediaStmt = db.prepare('DELETE FROM media WHERE id = ?');
  let removed = 0;
  for (const row of existingRows) {
    if (!row.path.toLowerCase().endsWith('.ts')) continue;
    if (isMediaFile(row.path)) continue;
    /* Safety net: never drop a record the user has interacted with, in case
       the text sniff ever misfires on a real transport stream. */
    const guarded = db.prepare(
      'SELECT 1 FROM media WHERE id = ? AND (likes > 0 OR tags != \'[]\' OR transcoded_path IS NOT NULL OR type = \'image\')'
    ).get(row.id);
    if (guarded) continue;
    deleteMediaStmt.run(row.id);
    removed++;
  }
  if (removed > 0) logger.info(`Scan: removed ${removed} stale non-media record(s)`);

  /* Backfill date_taken for existing records under this directory that were
     created before the date_taken column migration (row exists but is NULL).
     Uses mtime as a cheap proxy (no hash computed). Now scoped to a single
     query + a stat per NULL candidate instead of a per-file DB lookup for
     every file in the subtree (issue #40). Rows whose files no longer exist
     on disk stay NULL. */
  const nullRows = db.prepare(
    'SELECT path FROM media WHERE hidden = 0 AND date_taken IS NULL AND path >= ? AND path < ?'
  ).all(dirPrefix, dirPrefixUpper);
  if (nullRows.length > 0) {
    const tBackfill = performance.now();
    const backfillStmt = db.prepare(
      'UPDATE media SET date_taken = ? WHERE path = ? AND date_taken IS NULL AND hidden = 0'
    );
    let filled = 0;
    for (const { path: filePath } of nullRows) {
      try {
        backfillStmt.run((await fsp.stat(filePath)).mtime.toISOString(), filePath);
        filled++;
      } catch { /* stat may fail if the file vanished (orphan); leave NULL */ }
    }
    console.log(`[DBG][scan] BACKFILL ${(performance.now() - tBackfill).toFixed(0)}ms null=${nullRows.length} filled=${filled}`);
  }

  logger.info(`Scan: ${dirPath} — ${files.length} on disk, ${newFiles.length} new`);

  /* Nothing new to import — mark complete and skip the worker entirely. */
  if (newFiles.length === 0) {
    logger.debug(`no new files found, nothing to do`);
    db.prepare('UPDATE scans SET status = ? WHERE id = ?').run(SCAN_STATUS.COMPLETED, scanId);
    broadcastSse({ type: 'import_complete', scanId, total: 0, processed: 0 });
    console.log(`[DBG][scan] TOTAL ${(performance.now() - t0).toFixed(0)}ms (no new files)`);
    return { scanId, total: 0 };
  }

  /* Queue only new files. Existing files are untouched — they are not
     re-queued, which previously re-processed the whole library on refresh. */
  const insertStmt = db.prepare(
    'INSERT INTO import_queue (scan_id, path, status) VALUES (?, ?, ?)'
  );
  db.exec('BEGIN');
  for (const filePath of newFiles) {
    insertStmt.run(scanId, filePath, IMPORT_STATUS.PENDING);
  }
  db.exec('COMMIT');

  db.prepare('UPDATE scans SET status = ?, total = ? WHERE id = ?').run(SCAN_STATUS.IMPORTING, newFiles.length, scanId);

  broadcastSse({ type: 'import_started', scanId, total: newFiles.length, processed: 0 });

  /* Phase 2: Ensure the single worker thread is running — it will pick up
     the new scan's items along with any other queued work. */
  ensureScanWorker(logger);

  console.log(`[DBG][scan] TOTAL ${(performance.now() - t0).toFixed(0)}ms new=${newFiles.length}`);
  return { scanId, total: newFiles.length };
}

/**
 * Recursively find all files with a supported media extension.
 *
 * Async so the walk yields to the event loop between directory reads — the
 * previous synchronous `readdirSync` recursion blocked the request thread for
 * the whole walk, making the scan uncancellable and the server unresponsive.
 * Aborts cooperatively *after* each directory read by throwing an AbortError.
 */
async function findMediaFiles(dirPath, signal) {
  const results = [];
  const entries = await fsp.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (signal?.aborted) throw new DOMException('Scan aborted', 'AbortError');
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      results.push(...await findMediaFiles(fullPath, signal));
    } else if (isMediaFile(fullPath)) {
      results.push(fullPath);
    }
  }

  return results;
}
