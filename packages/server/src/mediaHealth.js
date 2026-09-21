/**
 * @file Media file-health classification.
 *
 * A media record can become unusable when its file disappears outside the app
 * (moved, renamed, deleted) or when its processing pipeline failed. This module
 * turns a media row into a health reason so the Failed media section can group
 * broken records with the related copies that may still be intact.
 */

import fs from 'node:fs';
import { MEDIA_STATUS } from '@photo-quest/shared';

/** Stat a path without throwing, returning undefined when it is not a file. */
function isFile(filePath) {
  if (!filePath) return false;
  const stat = fs.statSync(filePath, { throwIfNoEntry: false });
  return !!stat && stat.isFile();
}

/**
 * Whether the record still has a playable file on disk.
 *
 * A video whose transcoded output is gone but whose original survives is NOT
 * broken: the server re-transcodes it on demand (see GET /stream/:id).
 */
export function hasUsableFile(row) {
  return isFile(row.transcoded_path) || isFile(row.path);
}

/**
 * Classify one media row.
 *
 * @param {Object} row - A media table row.
 * @returns {'missing'|'error'|null} The failure reason, or null when healthy.
 *   `missing` takes precedence: a record with no file is broken regardless of
 *   its stored status.
 */
export function classifyMedia(row) {
  if (!hasUsableFile(row)) return 'missing';
  if (row.status === MEDIA_STATUS.ERROR) return 'error';
  return null;
}

/**
 * Scan every visible media row and return the broken ones.
 *
 * The caller owns the cost of this synchronous stat sweep, so it should be
 * cached when called frequently (see ops/listFailed.js).
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {{ rows: Object[], failed: Array<{ row: Object, reason: string }> }}
 */
export function scanFailedMedia(db) {
  const rows = db.prepare('SELECT * FROM media WHERE hidden = 0').all();
  const failed = [];
  for (const row of rows) {
    const reason = classifyMedia(row);
    if (reason) failed.push({ row, reason });
  }
  return { rows, failed };
}
