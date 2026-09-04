/**
 * @file Full-content verification for duplicate candidates.
 *
 * The database hash was historically a quick fingerprint, so it can only
 * identify candidates. Destructive duplicate actions must compare file bytes.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';

const CHUNK_SIZE = 1024 * 1024;

function hashFile(filePath) {
  let fd;
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return null;

    const hash = crypto.createHash('sha256');
    const buffer = Buffer.allocUnsafe(CHUNK_SIZE);
    fd = fs.openSync(filePath, 'r');
    for (let position = 0; position < stat.size;) {
      const bytesRead = fs.readSync(fd, buffer, 0, Math.min(buffer.length, stat.size - position), position);
      if (bytesRead === 0) return null;
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
    return hash.digest('hex');
  } catch {
    return null;
  } finally {
    if (fd != null) fs.closeSync(fd);
  }
}

/**
 * Split fingerprint candidates into groups that have identical full contents.
 * Missing or unreadable files are excluded rather than treated as duplicates.
 */
export function findVerifiedDuplicateGroups(items) {
  const groups = new Map();
  for (const item of items) {
    const hash = hashFile(item.path);
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
export function getVerifiedDuplicateGroup(db, ids) {
  const normalizedIds = [...new Set((Array.isArray(ids) ? ids : []).map(Number))]
    .filter(Number.isInteger)
    .filter(id => id > 0);
  if (normalizedIds.length < 2) return null;

  const placeholders = normalizedIds.map(() => '?').join(', ');
  const items = db.prepare(
    `SELECT * FROM media WHERE hidden = 0 AND id IN (${placeholders})`
  ).all(...normalizedIds);
  if (items.length !== normalizedIds.length) return null;

  const groups = findVerifiedDuplicateGroups(items);
  return groups.length === 1 && groups[0].items.length === items.length ? groups[0] : null;
}
