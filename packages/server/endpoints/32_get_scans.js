/**
 * @file GET /scans -- Get status of all scans (or a specific one).
 *
 * Returns scan progress info so the client can display import status.
 * Supports optional query param: /scans?id=3 for a specific scan.
 */

import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'GET',
    pathname: '/scans',
  }, async (req, res) => {
    const db = kojo.get('db');
    const url = new URL(req.url, `http://${req.headers.host}`);
    const scanId = url.searchParams.get('id');

    if (scanId) {
      const scan = db.prepare('SELECT * FROM scans WHERE id = ?').get(Number(scanId));
      if (scan) {
        return json(res, 200, scan);
      }
      return json(res, 404, { error: 'Scan not found' });
    }

    /* Return all active (non-completed) scans, plus the 5 most recent. */
    const results = db.prepare(
      `SELECT * FROM scans
       WHERE status != 'completed'
       UNION
       SELECT * FROM scans
       ORDER BY id DESC LIMIT 5`
    ).all();

    json(res, 200, results);
  });
};
