/**
 * @file Background backfill of legacy 64 KB-fingerprint media hashes.
 *
 * Before issue #58 the scan pipeline stored `media.hash` as
 * `sha256(first 64 KB + file size)[:32]`. Since then it stores the full-content
 * hash, so a matching hash is exact identity. Rows written by the old algorithm
 * still carry a fingerprint: they group inconsistently with full-content rows
 * (false negatives) and can group files that merely share a prefix and size
 * (false positives) — see issue #63.
 *
 * This module re-hashes those rows in one background pass at boot and stamps
 * them with the current `HASH_VERSION`, reporting progress to the server log.
 * It is:
 *  - **Bounded:** small batches, yielding to the event loop between them, so it
 *    never runs on a request path and never blocks the server.
 *  - **Complete:** it keeps going until no legacy row remains, rather than
 *    spreading the work across boots.
 *  - **Resumable:** every row is stamped the moment it is re-hashed, so if the
 *    process is killed mid-run the next boot continues where it left off.
 *  - **Safe:** rows whose file is missing/unreadable are skipped (left legacy)
 *    rather than stamped with an unverified hash.
 */

import { HASH_VERSION } from '@photo-quest/shared';
import { computeFileHash } from './fileHash.js';

/** Rows re-hashed per batch before yielding to the event loop. */
const DEFAULT_BATCH_SIZE = 20;

/** Maximum number of progress lines emitted during a run. */
const MAX_PROGRESS_LINES = 50;

/**
 * Count rows still holding a legacy fingerprint.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {number}
 */
export function countLegacyHashes(db) {
  const { n } = db.prepare(`
    SELECT COUNT(*) AS n FROM media
    WHERE hash IS NOT NULL AND hash != ''
      AND (hash_version IS NULL OR hash_version != ?)
  `).get(HASH_VERSION);
  return n;
}

/**
 * Re-hash one batch of legacy rows, resuming after `afterId`.
 *
 * The cursor advances past every row in the batch — including skipped ones — so
 * a run always terminates even when some files are unreadable.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{ afterId?: number, batchSize?: number, logger?: object }} [opts]
 * @returns {Promise<{ rows: object[], lastId: number, updated: number, skipped: number }>}
 */
export async function backfillHashBatch(db, { afterId = 0, batchSize = DEFAULT_BATCH_SIZE, logger = console } = {}) {
  const rows = db.prepare(`
    SELECT id, path FROM media
    WHERE id > ? AND hash IS NOT NULL AND hash != ''
      AND (hash_version IS NULL OR hash_version != ?)
    ORDER BY id
    LIMIT ?
  `).all(afterId, HASH_VERSION, batchSize);

  const update = db.prepare(
    "UPDATE media SET hash = ?, hash_version = ?, updated_at = datetime('now') WHERE id = ?"
  );

  let updated = 0;
  let skipped = 0;
  let lastId = afterId;
  for (const row of rows) {
    lastId = row.id;
    try {
      const hash = await computeFileHash(row.path);
      update.run(hash, HASH_VERSION, row.id);
      updated++;
    } catch (err) {
      skipped++;
      logger.warn?.(`[hashBackfill] skipped id=${row.id} (${row.path}): ${err.message}`);
    }
  }

  return { rows, lastId, updated, skipped };
}

/**
 * Re-hash every legacy row in one pass until none remain, yielding between
 * batches and reporting progress to `logger`.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{ batchSize?: number, logger?: object, shouldStop?: () => boolean }} [opts]
 * @returns {Promise<{ total: number, updated: number, skipped: number, batches: number }>}
 */
export async function backfillHashes(db, { batchSize = DEFAULT_BATCH_SIZE, logger = console, shouldStop } = {}) {
  const total = countLegacyHashes(db);
  if (total === 0) {
    logger.debug?.('[hashBackfill] no legacy hashes to re-hash');
    return { total: 0, updated: 0, skipped: 0, batches: 0 };
  }

  logger.info?.(`[hashBackfill] re-hashing ${total} legacy hash(es)...`);
  const logEvery = Math.max(batchSize, Math.ceil(total / MAX_PROGRESS_LINES));

  let afterId = 0;
  let updated = 0;
  let skipped = 0;
  let batches = 0;
  let processed = 0;
  let lastLogged = 0;

  while (!shouldStop?.()) {
    const batch = await backfillHashBatch(db, { afterId, batchSize, logger });
    if (batch.rows.length === 0) break;

    afterId = batch.lastId;
    updated += batch.updated;
    skipped += batch.skipped;
    batches++;
    processed += batch.rows.length;

    if (processed - lastLogged >= logEvery) {
      const pct = Math.min(100, Math.floor((processed / total) * 100));
      logger.info?.(`[hashBackfill] ${processed}/${total} (${pct}%) — ${updated} re-hashed, ${skipped} skipped`);
      lastLogged = processed;
    }

    /* Yield so HTTP requests and the scan worker keep running. */
    await new Promise(resolve => setImmediate(resolve));
  }

  logger.info?.(`[hashBackfill] done — ${updated} re-hashed, ${skipped} skipped of ${total} legacy hash(es)`);
  return { total, updated, skipped, batches };
}

/** Guards against two backfills running at once (e.g. a double boot). */
let running = false;

/**
 * Kick off the legacy-hash backfill in the background. Safe to call at boot:
 * a second call while one is running is ignored.
 *
 * @param {object} kojo
 * @param {object} logger
 */
export function startHashBackfill(kojo, logger) {
  if (running) return;
  running = true;

  const db = kojo.get('db');
  backfillHashes(db, { logger })
    .catch(err => logger.warn?.(`[hashBackfill] failed: ${err.message}`))
    .finally(() => { running = false; });
}
