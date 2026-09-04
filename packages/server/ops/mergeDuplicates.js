/**
 * @file Merge a duplicate group into a single media record.
 *
 * Kojo op: accessed as `kojo.ops.mergeDuplicates({ ids })`.
 * Verifies the selected visible records have identical contents, keeps the most "mature" one
 * (earliest created_at, tie-broken by most likes), absorbs the union of its
 * tags plus the sum of its likes, then deletes the other records (and their
 * files on disk) via the `removeMedia` op.
 *
 * @param {{ ids: number[] }} params
 * @returns {Object}
 *   On success: { media, merged, deletedFiles }
 *   On error:   { error, status } (400 invalid input / no group)
 */

import removeMedia from './removeMedia.js';
import { getVerifiedDuplicateGroup } from '../src/verifiedDuplicates.js';

function parseTags(row) {
  if (Array.isArray(row.tags)) return row.tags;
  if (typeof row.tags === 'string') {
    try { return JSON.parse(row.tags || '[]'); } catch { return []; }
  }
  return [];
}

/**
 * Pick the most mature record: earliest created_at, tie-broken by most likes.
 */
function pickMaster(items) {
  return [...items].sort((a, b) => {
    const aDate = a.created_at || '';
    const bDate = b.created_at || '';
    if (aDate !== bDate) return aDate < bDate ? -1 : 1;
    return (b.likes || 0) - (a.likes || 0);
  })[0];
}

export default function ({ ids } = {}) {
  const [kojo, logger] = this;
  const db = kojo.get('db');

  const group = getVerifiedDuplicateGroup(db, ids);
  if (!group) {
    logger.debug('no verified duplicate group for selected ids');
    return { error: 'No verified duplicate group for these media items', status: 400 };
  }
  const { hash, items } = group;

  const master = pickMaster(items);
  const removals = items.filter(i => i.id !== master.id);

  /* Absorb tags (union) and likes (sum) into the master. */
  const tagSet = new Set(parseTags(master));
  let likeSum = master.likes || 0;
  for (const row of removals) {
    for (const tag of parseTags(row)) tagSet.add(tag);
    likeSum += row.likes || 0;
  }

  db.prepare(
    "UPDATE media SET tags = ?, likes = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(JSON.stringify([...tagSet]), likeSum, master.id);

  /* Keep folder-specific thumbnail choices when their identical media record
     is removed. The thumbnail time remains valid for the same content. */
  const removalIds = removals.map(row => row.id);
  const placeholders = removalIds.map(() => '?').join(', ');
  db.prepare(
    `UPDATE folders SET thumbnail_media_id = ? WHERE thumbnail_media_id IN (${placeholders})`
  ).run(master.id, ...removalIds);

  /* Delete the other records (and their files) via the shared removeMedia op. */
  let deletedFiles = 0;
  for (const row of removals) {
    const result = removeMedia.apply(this, [row.id]);
    if (result.deleted) deletedFiles++;
  }

  const media = db.prepare('SELECT * FROM media WHERE id = ?').get(master.id);
  media.tags = parseTags(media);

  const { total } = db.prepare(
    `SELECT COUNT(DISTINCT je.value) AS total
     FROM media m, json_each(m.tags) je
     WHERE m.hidden = 0 AND json_valid(m.tags)`
  ).get();
  media.tagCount = total;

  logger.debug(`merged hash=${hash} master=${master.id} removed=${removals.length} deletedFiles=${deletedFiles}`);
  return { media, merged: removals.length, removedIds: removals.map(r => r.id), deletedFiles };
}
