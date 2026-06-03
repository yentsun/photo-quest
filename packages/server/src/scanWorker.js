/**
 * @file Single worker thread for processing the import queue.
 *
 * Picks pending items from ANY active (importing) scan, so multiple
 * concurrent scans share one thread instead of spawning one each.
 * Exits when the queue is fully drained.
 */

import { workerData, parentPort } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
import { processOneItem } from '../ops/scanMedia.js';
import { SCAN_STATUS, IMPORT_STATUS } from '@photo-quest/shared';

const { dbPath } = workerData;

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA busy_timeout = 5000');

const logger = {
  debug: (msg) => parentPort.postMessage({ type: 'log', level: 'debug', msg }),
  info:  (msg) => parentPort.postMessage({ type: 'log', level: 'info',  msg }),
  warn:  (msg) => parentPort.postMessage({ type: 'log', level: 'warn',  msg }),
};

const nextItem = db.prepare(`
  SELECT iq.id, iq.path, iq.scan_id
  FROM import_queue iq
  JOIN scans s ON s.id = iq.scan_id
  WHERE iq.status = ? AND s.status = ?
  ORDER BY iq.scan_id, iq.id
  LIMIT 1
`);

const remainingCount = db.prepare(
  `SELECT COUNT(*) AS n FROM import_queue WHERE scan_id = ? AND status = ?`
);

const scanProgress = db.prepare('SELECT total, processed FROM scans WHERE id = ?');

async function run() {
  while (true) {
    const item = nextItem.get(IMPORT_STATUS.PENDING, SCAN_STATUS.IMPORTING);
    if (!item) break;

    try {
      await processOneItem(db, item.id, item.path, logger);
    } catch (err) {
      logger.warn(`Failed to import ${item.path}: ${err.message}`);
      db.prepare('UPDATE import_queue SET status = ?, error = ? WHERE id = ?')
        .run(IMPORT_STATUS.FAILED, err.message, item.id);
    }

    db.prepare('UPDATE scans SET processed = processed + 1 WHERE id = ?').run(item.scan_id);
    const progress = scanProgress.get(item.scan_id);

    parentPort.postMessage({
      type: 'sse',
      event: { type: 'import_progress', scanId: item.scan_id, total: progress.total, processed: progress.processed },
    });

    const { n } = remainingCount.get(item.scan_id, IMPORT_STATUS.PENDING);
    if (n === 0) {
      db.prepare('UPDATE scans SET status = ? WHERE id = ?').run(SCAN_STATUS.COMPLETED, item.scan_id);
      parentPort.postMessage({
        type: 'sse',
        event: { type: 'import_complete', scanId: item.scan_id, total: progress.total, processed: progress.processed },
      });
    }
  }

  db.close();
}

run().catch((err) => {
  parentPort.postMessage({ type: 'error', message: err.message });
  process.exit(1);
});
