/**
 * @file Delete every record in a duplicate group.
 *
 * Kojo op: accessed as `kojo.ops.deleteDuplicates({ hash })`.
 * Removes all visible records sharing `hash` (and their files on disk) via
 * the `removeMedia` op.
 *
 * @param {{ hash: string }} params
 * @returns {Object}
 *   On success: { deleted, deletedFiles }
 *   On error:   { error, status } (400 invalid input)
 */

import removeMedia from './removeMedia.js';

export default function ({ hash } = {}) {
  const [kojo, logger] = this;
  const db = kojo.get('db');

  if (!hash) return { error: 'hash is required', status: 400 };

  const items = db.prepare('SELECT id FROM media WHERE hash = ? AND hidden = 0').all(hash);
  let deletedFiles = 0;
  for (const row of items) {
    const result = removeMedia.apply(this, [row.id]);
    if (result.deleted) deletedFiles++;
  }

  logger.debug(`deleted group hash=${hash} records=${items.length} deletedFiles=${deletedFiles}`);
  return { deleted: items.length, deletedFiles };
}
