/**
 * @file Full-content verification for duplicate candidates.
 *
 * The database hash was historically a quick fingerprint, so it can only
 * identify candidates. Destructive duplicate actions must compare file bytes.
 *
 * Hashing is asynchronous and streamed: the HTTP server runs in the same Node
 * process, so reading multi-MB videos synchronously would block the event loop
 * and stall or drop unrelated requests for the whole read.
 */

import fs from 'node:fs';
import { HASH_VERSION } from '@photo-quest/shared';
import { computeFileHash } from './fileHash.js';

/* Verification feeds a destructive action, so only treat a file as unreadable
   when its stream makes no progress for this long (e.g. a sleeping network
   drive). A large file that keeps streaming is never cut off by its size. */
const HASH_IDLE_TIMEOUT_MS = 30_000;

/** Normalise an id list to unique positive integers. */
export function normalizeIds(ids) {
  return [...new Set((Array.isArray(ids) ? ids : []).map(Number))]
    .filter(Number.isInteger)
    .filter(id => id > 0);
}

/**
 * Hash one file, yielding to the event loop between chunks.
 *
 * Shares `computeFileHash` with the scan pipeline so verification and indexing
 * cannot drift apart. Missing, unreadable and non-file paths yield `null`.
 *
 * @param {string} filePath
 * @returns {Promise<string|null>}
 */
async function hashFile(filePath) {
  try {
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile()) return null;
    return await computeFileHash(filePath, HASH_IDLE_TIMEOUT_MS);
  } catch {
    return null;
  }
}

/**
 * Split fingerprint candidates into groups that have identical full contents.
 * Missing or unreadable files are excluded rather than treated as duplicates.
 */
export async function findVerifiedDuplicateGroups(items) {
  const groups = new Map();
  for (const item of items) {
    const hash = await hashFile(item.path);
    if (!hash) continue;
    const group = groups.get(hash) || { hash, items: [] };
    group.items.push(item);
    groups.set(hash, group);
  }
  return [...groups.values()].filter(group => group.items.length > 1);
}

/**
 * Confirm every selected record still exists and has identical file contents.
 */
export async function getVerifiedDuplicateGroup(db, ids) {
  const normalizedIds = normalizeIds(ids);
  if (normalizedIds.length < 2) return null;

  const placeholders = normalizedIds.map(() => '?').join(', ');
  const items = db.prepare(
    `SELECT * FROM media WHERE hidden = 0 AND id IN (${placeholders})`
  ).all(...normalizedIds);
  if (items.length !== normalizedIds.length) return null;

  /* Split records into those whose file still exists (and can be byte-verified)
     and those whose file is gone. A missing file cannot be verified, but it is
     also safe to drop — there is nothing left on disk to delete — so it must not
     block the whole group. Every surviving file, however, must be byte-identical. */
  const existing = [];
  const missing = [];
  let contentHash = null;
  for (const item of items) {
    const itemHash = await hashFile(item.path);
    if (itemHash == null) {
      missing.push(item);
    } else if (contentHash == null) {
      contentHash = itemHash;
      existing.push(item);
    } else if (itemHash === contentHash) {
      existing.push(item);
    } else {
      return null;
    }
  }

  return { hash: contentHash || items[0].hash, items, existing, missing };
}

/**
 * Correct stored hashes that no longer match the file on disk.
 *
 * A row stamped with the current `HASH_VERSION` is normally never re-hashed, so
 * a file replaced after it was scanned keeps a stale hash and can keep appearing
 * in a duplicate group that no longer exists. Destructive duplicate actions call
 * this after full-content verification fails, so the correction is persisted and
 * the false group stops being offered. Missing or unreadable files are left
 * untouched (their stored hash is still the best available).
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {number[]} ids
 * @returns {Promise<number>} Number of records whose stored hash was corrected.
 */
export async function reconcileStaleHashes(db, ids) {
  const normalizedIds = normalizeIds(ids);
  if (normalizedIds.length === 0) return 0;

  const placeholders = normalizedIds.map(() => '?').join(', ');
  const items = db.prepare(
    `SELECT id, path, hash FROM media WHERE id IN (${placeholders})`
  ).all(...normalizedIds);

  const update = db.prepare(
    "UPDATE media SET hash = ?, hash_version = ?, updated_at = datetime('now') WHERE id = ?"
  );

  let reconciled = 0;
  for (const item of items) {
    const fullHash = await hashFile(item.path);
    if (!fullHash) continue;
    /* `computeFileHash` already truncates to the length stored in `media.hash`,
       so the value can be compared and persisted as-is. */
    if (fullHash === item.hash) continue;
    update.run(fullHash, HASH_VERSION, item.id);
    reconciled++;
  }
  return reconciled;
}
