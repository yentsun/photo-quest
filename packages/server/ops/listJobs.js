/**
 * @file List all job records, newest first.
 *
 * Kojo op: accessed as `kojo.ops.listJobs()`.
 * Reloads the database from disk first to see worker changes.
 */

import { reloadDb, getDb } from '../src/db.js';

export default function () {
  const [kojo, logger] = this;

  /* Reload from disk so we see changes the worker has made. */
  reloadDb();
  const db = getDb();

  /* Also update kojo state with the refreshed db instance. */
  kojo.set('db', db);

  const stmt = db.prepare('SELECT * FROM jobs ORDER BY created_at DESC');
  const results = [];

  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();

  return results;
}
