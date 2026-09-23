/**
 * @file Media file-health classification.
 *
 * A media record can become unusable when its file disappears outside the app
 * (moved, renamed, deleted) or when its processing pipeline failed. This module
 * turns a media row into a health reason so the Failed media section can group
 * broken records with the related copies that may still be intact.
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { MEDIA_STATUS } from '@photo-quest/shared';

/** Stat a path without throwing, returning undefined when it is not a file. */
function isFile(filePath) {
  if (!filePath) return false;
  const stat = fs.statSync(filePath, { throwIfNoEntry: false });
  return !!stat && stat.isFile();
}

/** Async equivalent of {@link isFile} — never blocks the event loop. */
async function isFileAsync(filePath) {
  if (!filePath) return false;
  try {
    const stat = await fsp.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

/**
 * Whether the record still has a playable file on disk.
 *
 * A video whose transcoded output is gone but whose original survives is NOT
 * broken: the server re-transcodes it on demand (see GET /stream/:id).
 */
export function hasUsableFile(row) {
  return isFile(row.transcoded_path) || isFile(row.path);
}

/**
 * Classify one media row.
 *
 * @param {Object} row - A media table row.
 * @returns {'missing'|'error'|null} The failure reason, or null when healthy.
 *   `missing` takes precedence: a record with no file is broken regardless of
 *   its stored status.
 */
export function classifyMedia(row) {
  if (!hasUsableFile(row)) return 'missing';
  if (row.status === MEDIA_STATUS.ERROR) return 'error';
  return null;
}

/**
 * Scan every visible media row and return the broken ones.
 *
 * The caller owns the cost of this synchronous stat sweep, so it should be
 * cached when called frequently (see ops/listFailed.js).
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {{ rows: Object[], failed: Array<{ row: Object, reason: string }> }}
 */
export function scanFailedMedia(db) {
  const rows = db.prepare('SELECT * FROM media WHERE hidden = 0').all();
  const failed = [];
  for (const row of rows) {
    const reason = classifyMedia(row);
    if (reason) failed.push({ row, reason });
  }
  return { rows, failed };
}

/** Async twin of {@link classifyMedia} — uses non-blocking stat calls. */
export async function classifyMediaAsync(row) {
  if (!(await isFileAsync(row.transcoded_path)) && !(await isFileAsync(row.path))) return 'missing';
  if (row.status === MEDIA_STATUS.ERROR) return 'error';
  return null;
}

/** Run `worker` over `items` with at most `limit` promises in flight. */
async function runPool(items, limit, worker) {
  let next = 0;
  const size = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await worker(item);
    }
  }));
}

/**
 * Non-blocking version of {@link scanFailedMedia}.
 *
 * Walks the visible media table with keyset batches (so no single query
 * materialises the whole table) and stats each record with async IO bounded by
 * a concurrency pool, yielding to the event loop between batches. This is the
 * version used by the background health sweep — it never blocks HTTP requests.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{ batchSize?: number, concurrency?: number, logger?: object, shouldStop?: () => boolean }} [opts]
 * @returns {Promise<{ failed: Array<{ row: Object, reason: string }>, scanned: number }>}
 */
export async function scanFailedMediaAsync(db, {
  batchSize = 1000,
  concurrency = 64,
  logger = console,
  shouldStop,
} = {}) {
  const select = db.prepare(
    'SELECT * FROM media WHERE hidden = 0 AND id > ? ORDER BY id LIMIT ?'
  );
  const failed = [];
  let lastId = 0;
  let scanned = 0;

  while (!shouldStop?.()) {
    const rows = select.all(lastId, batchSize);
    if (rows.length === 0) break;
    lastId = rows[rows.length - 1].id;
    scanned += rows.length;

    await runPool(rows, concurrency, async (row) => {
      const reason = await classifyMediaAsync(row);
      if (reason) failed.push({ row, reason });
    });

    logger.debug?.(`[healthScan] scanned ${scanned} media, ${failed.length} broken so far`);

    /* Yield so HTTP requests and other background work keep running. */
    await new Promise(resolve => setImmediate(resolve));
  }

  return { failed, scanned };
}
