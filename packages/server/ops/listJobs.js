/**
 * @file List all job records, newest first.
 *
 * Kojo op: accessed as `kojo.ops.listJobs()`.
 * With WAL mode, the server sees worker writes automatically — no reload needed.
 */

export default function () {
  const [kojo] = this;
  const db = kojo.get('db');

  return db.prepare('SELECT * FROM jobs ORDER BY created_at DESC').all();
}
