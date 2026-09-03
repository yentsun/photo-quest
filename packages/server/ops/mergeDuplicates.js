/**
 * @file Merge a duplicate group into a single media record.
 *
 * Kojo op: accessed as `kojo.ops.mergeDuplicates({ hash })`.
 * Looks up every visible record sharing `hash`, keeps the most "mature" one
 * (earliest created_at, tie-broken by most likes), absorbs the union of its
 * tags plus the sum of its likes, then deletes the other records (and their
 * files on disk) via the `removeMedia` op.
 *
 * @param {{ hash: string }} params
 * @returns {Object}
 *   On success: { media, merged, deletedFiles }
 *   On error:   { error, status } (400 invalid input / no group)
 */

import removeMedia from './removeMedia.js';

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

export default function ({ hash } = {}) {
  const [kojo, logger] = this;
  const db = kojo.get('db');

  if (!hash) return { error: 'hash is required', status: 400 };

  const items = db.prepare('SELECT * FROM media WHERE hash = ? AND hidden = 0').all(hash);
  if (items.length < 2) {
    logger.debug(`no duplicate group for hash=${hash}`);
    return { error: 'No duplicate group for this hash', status: 400 };
  }

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
