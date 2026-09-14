/**
 * @file Full-content file hashing shared by the scan pipeline and the legacy
 * hash backfill.
 *
 * `media.hash` is a truncated SHA-256 of the ENTIRE file, so a matching hash
 * means exact byte-for-byte identity. Before issue #58 the pipeline hashed only
 * the first 64 KB plus the file size; those legacy fingerprints are re-hashed
 * with this algorithm (issue #63).
 */

import fs from 'node:fs';
import crypto from 'node:crypto';

/** Number of hex characters stored in `media.hash`. */
export const HASH_LENGTH = 32;

/**
 * Compute a content hash for a file.
 *
 * Uses the full file contents so a matching hash is exact identity. Async with
 * an idle timeout to avoid hanging on cloud-synced files: a large file may
 * legitimately take longer than `timeoutMs` overall, so the timer is reset on
 * every chunk and only fires when the read stream stops making progress.
 *
 * @param {string} filePath - Absolute path to the file.
 * @param {number} [timeoutMs] - Idle timeout between chunks.
 * @returns {Promise<string>} First 32 hex chars of the SHA-256 digest.
 */
export async function computeFileHash(filePath, timeoutMs = 5000) {
  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    let timer;
    const resetTimeout = () => {
      clearTimeout(timer);
      timer = setTimeout(() => stream.destroy(new Error('File read timed out')), timeoutMs);
    };

    resetTimeout();
    stream.on('data', (chunk) => {
      hash.update(chunk);
      /* A large file may legitimately take longer than timeoutMs overall;
         fail only when its read stream stops making progress. */
      resetTimeout();
    });
    stream.on('end', () => { clearTimeout(timer); resolve(); });
    stream.on('error', (err) => { clearTimeout(timer); reject(err); });
  });

  return hash.digest('hex').substring(0, HASH_LENGTH);
}
