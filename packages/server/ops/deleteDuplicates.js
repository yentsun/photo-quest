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
 *   On error:   { error, status, code?, reconciled? }
 *     400 invalid input / no group; 409 when the group was a stale-hash false
 *     positive and the stored hashes were corrected.
 */

import removeMedia from './removeMedia.js';
import { getVerifiedDuplicateGroup, reconcileStaleHashes, normalizeIds } from '../src/verifiedDuplicates.js';

export default function ({ ids } = {}) {
  const [kojo, logger] = this;
  const db = kojo.get('db');

  const group = getVerifiedDuplicateGroup(db, ids);
  if (!group) {
    /* A stored hash goes stale when a file is replaced after it was scanned, so
       the group can be a false positive. Re-hash the selection to persist the
       correction (the group then stops being offered) and report the conflict
       distinctly from an invalid selection. Only two or more records can form a
       group; a smaller selection is invalid input, not a stale group. */
    const reconciled = normalizeIds(ids).length >= 2 ? reconcileStaleHashes(db, ids) : 0;
    logger.debug(`no verified duplicate group for selected ids (reconciled=${reconciled})`);
    if (reconciled > 0) {
      return {
        error: 'These items are no longer duplicates; their hashes were refreshed',
        status: 409,
        code: 'STALE_DUPLICATES',
        reconciled,
      };
    }
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
