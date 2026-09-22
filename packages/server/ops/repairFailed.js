/**
 * @file Attempt to repair media records that the Failed section flags as broken.
 *
 * Kojo op: accessed as `kojo.ops.repairFailed({ ids?, all? })`.
 *
 * A record can be stuck in a failed state even though it is still usable (for
 * example a transcode that actually succeeded, leaving a valid `transcoded_path`
 * while a later re-probe of the already-deleted original set `status = 'error'`).
 * This op re-checks the files on disk and reconciles the stored status:
 *
 *   - a usable transcoded output exists  -> `ready` (served as-is by /stream)
 *   - the original file exists:
 *       video -> `pending` and re-queued for a fresh transcode
 *       image -> `ready` (images need no transcode)
 *   - neither file exists -> left untouched and reported as `unrepairable`
 *
 * @param {{ ids?: number[], all?: boolean }} [opts]
 *   `ids` repairs the given records; `all` repairs every currently-failed one.
 * @returns {{ repaired: number, restored: number, requeued: number,
 *   unrepairable: number, results: Array<{ id: number, outcome: string, reason?: string }> }}
 */

import fs from 'node:fs';
import { MEDIA_STATUS, MEDIA_TYPE } from '@photo-quest/shared';
import { getFailedMediaRows, removeFromFailedSnapshot } from './listFailed.js';

/** Stat a path without throwing, returning true only for a regular file. */
function isFile(filePath) {
  if (!filePath) return false;
  const stat = fs.statSync(filePath, { throwIfNoEntry: false });
  return !!stat && stat.isFile();
}

export default function repairFailed({ ids, all = false } = {}) {
  const [kojo, logger] = this;
  const db = kojo.get('db');

  /* `all` works off the cached health snapshot so it never has to run a
     synchronous full-library sweep on the request thread. */
  const targets = all
    ? getFailedMediaRows(db)
    : (Array.isArray(ids) ? ids : [])
        .map(id => db.prepare('SELECT * FROM media WHERE id = ?').get(Number(id)))
        .filter(Boolean);

  const results = [];
  let restored = 0;
  let requeued = 0;
  let unrepairable = 0;

  const setStatus = db.prepare("UPDATE media SET status = ?, updated_at = datetime('now') WHERE id = ?");

  for (const row of targets) {
    if (isFile(row.transcoded_path)) {
      setStatus.run(MEDIA_STATUS.READY, row.id);
      restored++;
      results.push({ id: row.id, outcome: 'restored', reason: 'transcoded' });
      continue;
    }

    if (isFile(row.path)) {
      if (row.type === MEDIA_TYPE.IMAGE) {
        setStatus.run(MEDIA_STATUS.READY, row.id);
        restored++;
        results.push({ id: row.id, outcome: 'restored', reason: 'original' });
      } else {
        setStatus.run(MEDIA_STATUS.PENDING, row.id);
        kojo.ops?.transcodeNow?.(row.id);
        requeued++;
        results.push({ id: row.id, outcome: 'requeued' });
      }
      continue;
    }

    unrepairable++;
    results.push({ id: row.id, outcome: 'unrepairable' });
  }

  const repaired = restored + requeued;
  if (repaired > 0) {
    /* Drop the repaired records from the cached snapshot so the Failed section
       updates immediately, without waiting for the next background sweep. */
    removeFromFailedSnapshot(kojo, results.filter(r => r.outcome !== 'unrepairable').map(r => r.id));
  }
  logger.debug(`[repairFailed] all=${all} targets=${targets.length} restored=${restored} requeued=${requeued} unrepairable=${unrepairable}`);
  return { repaired, restored, requeued, unrepairable, results };
}
