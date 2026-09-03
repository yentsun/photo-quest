/**
 * @file Merge a duplicate group into a single media record.
 *
 * Kojo op: accessed as `kojo.ops.mergeDuplicates({ keepId, removeIds })`.
 * Keeps the master record (`keepId`), absorbs the union of its tags and the
 * sum of its likes, then deletes every other record (and its file on disk)
 * via the `removeMedia` op.
 *
 * @param {{ keepId: number|string, removeIds: Array<number|string> }} params
 * @returns {Object}
 *   On success: { media, merged, deletedFiles }
 *   On error:   { error, status } (400 invalid input / 404 keepId not found)
 */

import removeMedia from './removeMedia.js';

function parseTags(row) {
  if (Array.isArray(row.tags)) return row.tags;
  if (typeof row.tags === 'string') {
    try { return JSON.parse(row.tags || '[]'); } catch { return []; }
  }
  return [];
}

export default function ({ keepId, removeIds } = {}) {
  const [kojo, logger] = this;
  const db = kojo.get('db');

  if (keepId == null || !Array.isArray(removeIds) || removeIds.length === 0) {
    return { error: 'keepId and removeIds are required', status: 400 };
  }

  const keepIdNum = Number(keepId);
  const keep = db.prepare('SELECT * FROM media WHERE id = ?').get(keepIdNum);
  if (!keep) return { error: 'Master record not found', status: 404 };

  if (!keep.hash) {
    logger.debug(`master has no hash: id=${keepIdNum}`);
    return { error: 'Master record has no content hash', status: 400 };
  }

  /* Load the removals (excluding the master) and validate they share the same hash. */
  const removals = [];
  for (const id of removeIds) {
    const num = Number(id);
    if (!Number.isFinite(num) || num === keepIdNum) continue;
    const row = db.prepare('SELECT * FROM media WHERE id = ?').get(num);
    if (row && row.hash === keep.hash) removals.push(row);
  }

  if (removals.length === 0) return { error: 'No duplicates to merge', status: 400 };

  /* Absorb tags (union) and likes (sum) into the master. */
  const tagSet = new Set(parseTags(keep));
  let likeSum = keep.likes || 0;
  for (const row of removals) {
    for (const tag of parseTags(row)) tagSet.add(tag);
    likeSum += row.likes || 0;
  }

  db.prepare(
    "UPDATE media SET tags = ?, likes = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(JSON.stringify([...tagSet]), likeSum, keepIdNum);

  /* Delete the other records (and their files) via the shared removeMedia op. */
  let deletedFiles = 0;
  for (const row of removals) {
    const result = removeMedia.apply(this, [row.id]);
    if (result.deleted) deletedFiles++;
  }

  const media = db.prepare('SELECT * FROM media WHERE id = ?').get(keepIdNum);
  media.tags = parseTags(media);

  const { total } = db.prepare(
    `SELECT COUNT(DISTINCT je.value) AS total
     FROM media m, json_each(m.tags) je
     WHERE m.hidden = 0 AND json_valid(m.tags)`
  ).get();
  media.tagCount = total;

  logger.debug(`merged id=${keepIdNum} removed=${removals.length} deletedFiles=${deletedFiles}`);
  return { media, merged: removals.length, deletedFiles };
}
