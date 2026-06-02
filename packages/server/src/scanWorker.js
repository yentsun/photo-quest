/**
 * @file Worker thread for processing the import queue.
 *
 * Runs in a dedicated thread so the main HTTP event loop stays responsive
 * during large library scans. Receives { dbPath, scanId } via workerData,
 * opens its own SQLite connection (WAL mode supports concurrent access),
 * and posts messages back to the main thread:
 *   { type: 'sse',  event: { ... } }  — relay to SSE clients
 *   { type: 'log',  level, msg }      — relay to server logger
 *   { type: 'error', message }        — unhandled failure
 */

import { workerData, parentPort } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
import { processOneItem } from '../ops/scanMedia.js';
import { SCAN_STATUS, IMPORT_STATUS } from '@photo-quest/shared';

const { dbPath, scanId } = workerData;

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA busy_timeout = 5000');

const logger = {
  debug: (msg) => parentPort.postMessage({ type: 'log', level: 'debug', msg }),
  info:  (msg) => parentPort.postMessage({ type: 'log', level: 'info',  msg }),
  warn:  (msg) => parentPort.postMessage({ type: 'log', level: 'warn',  msg }),
};

async function run() {
  while (true) {
    const scanRow = db.prepare('SELECT status FROM scans WHERE id = ?').get(scanId);
    if (scanRow?.status === SCAN_STATUS.CANCELLED) {
      logger.info(`Scan ${scanId} was cancelled, stopping`);
      break;
    }

    const item = db.prepare(
      'SELECT id, path FROM import_queue WHERE scan_id = ? AND status = ? LIMIT 1'
    ).get(scanId, IMPORT_STATUS.PENDING);

    if (!item) {
      db.prepare('UPDATE scans SET status = ? WHERE id = ?').run(SCAN_STATUS.COMPLETED, scanId);
      const scan = db.prepare('SELECT total, processed FROM scans WHERE id = ?').get(scanId);
      parentPort.postMessage({
        type: 'sse',
        event: { type: 'import_complete', scanId, total: scan.total, processed: scan.processed },
      });
      break;
    }

    try {
      await processOneItem(db, item.id, item.path, logger);
    } catch (err) {
      logger.warn(`Failed to import ${item.path}: ${err.message}`);
      db.prepare('UPDATE import_queue SET status = ?, error = ? WHERE id = ?')
        .run(IMPORT_STATUS.FAILED, err.message, item.id);
    }

    db.prepare('UPDATE scans SET processed = processed + 1 WHERE id = ?').run(scanId);
    const progress = db.prepare('SELECT total, processed FROM scans WHERE id = ?').get(scanId);

    parentPort.postMessage({
      type: 'sse',
      event: { type: 'import_progress', scanId, total: progress.total, processed: progress.processed },
    });
  }

  db.close();
}

run().catch((err) => {
  parentPort.postMessage({ type: 'error', message: err.message });
  process.exit(1);
});
