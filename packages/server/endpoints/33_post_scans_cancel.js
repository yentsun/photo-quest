/**
 * @file POST /scans/:id/cancel -- Cancel an in-progress scan/import.
 *
 * Sets the scan status to 'cancelled'. The processQueue loop checks
 * this status before processing each item and stops if cancelled.
 */

import { SCAN_STATUS } from '@photo-quest/shared';
import { saveDb } from '../src/db.js';
import { broadcastSse } from '../src/sse.js';
import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'POST',
    pathname: '/scans/:id/cancel',
  }, async (req, res, params) => {
    const db = kojo.get('db');
    const scanId = Number(params.id);

    /* Verify scan exists and is active. */
    const stmt = db.prepare('SELECT id, status FROM scans WHERE id = ?');
    stmt.bind([scanId]);
    const hasScan = stmt.step();
    const scan = hasScan ? stmt.getAsObject() : null;
    stmt.free();

    if (!scan) {
      return json(res, 404, { error: 'Scan not found' });
    }

    if (scan.status !== SCAN_STATUS.IMPORTING && scan.status !== SCAN_STATUS.DISCOVERING) {
      return json(res, 400, { error: `Scan is already ${scan.status}` });
    }

    db.run(
      'UPDATE scans SET status = ? WHERE id = ?',
      [SCAN_STATUS.CANCELLED, scanId]
    );
    saveDb();

    broadcastSse({ type: 'import_cancelled', scanId });
    logger.info(`Scan ${scanId} cancelled by user`);

    json(res, 200, { scanId, status: SCAN_STATUS.CANCELLED });
  });
};
