/**
 * @file GET /jobs -- List all job records, newest first.
 *
 * Kojo endpoint: registers route via the addHttpRoute op.
 * Delegates to `kojo.ops.listJobs()` which reloads the database from disk
 * first (to pick up changes made by the worker process) and then queries
 * all rows from the `jobs` table.
 */

import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'GET',
    pathname: '/jobs',
  }, (req, res) => {
    const rows = kojo.ops.listJobs();
    json(res, 200, rows);
  });
};
