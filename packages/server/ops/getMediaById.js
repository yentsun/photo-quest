/**
 * @file Fetch a single media record by its numeric ID.
 *
 * Kojo op: accessed as `kojo.ops.getMediaById(id)`.
 *
 * @param {number|string} id - The media record's primary key.
 * @returns {Object|null} The media row, or null if not found.
 */

export default function (id) {
  const [kojo] = this;
  const db = kojo.get('db');

  const media = db.prepare('SELECT * FROM media WHERE id = ?').get(Number(id));
  if (!media) return null;

  if (media.status === 'error') {
    const job = db.prepare(
      "SELECT error FROM jobs WHERE media_id = ? AND status = 'failed' ORDER BY updated_at DESC LIMIT 1"
    ).get(Number(id));
    if (job?.error) media.job_error = job.error;
  }

  return media;
}
