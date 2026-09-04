/**
 * @file Delete every record in a duplicate group.
 *
 * Kojo op: accessed as `kojo.ops.deleteDuplicates({ ids })`.
 * Removes selected visible records after verifying they have identical contents
 * (and their files on disk) via
 * the `removeMedia` op.
 *
 * @param {{ ids: number[] }} params
 * @returns {Object}
 *   On success: { deleted, deletedFiles }
 *   On error:   { error, status } (400 invalid input)
 */

import removeMedia from './removeMedia.js';
import { getVerifiedDuplicateGroup } from './verifiedDuplicates.js';

export default function ({ ids } = {}) {
  const [kojo, logger] = this;
  const db = kojo.get('db');

  const group = getVerifiedDuplicateGroup(db, ids);
  if (!group) {
    logger.debug('no verified duplicate group for selected ids');
    return { error: 'No verified duplicate group for these media items', status: 400 };
  }

  const items = group.items;
  let deletedFiles = 0;
  for (const row of items) {
    const result = removeMedia.apply(this, [row.id]);
    if (result.deleted) deletedFiles++;
  }

  logger.debug(`deleted group hash=${group.hash} records=${items.length} deletedFiles=${deletedFiles}`);
  return { deleted: items.length, removedIds: items.map(r => r.id), deletedFiles };
}
