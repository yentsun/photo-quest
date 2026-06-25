/**
 * @file Fetch a single media record by its numeric ID.
 *
 * Kojo op: accessed as `kojo.ops.getMediaById(id)`.
 *
 * @param {number|string} id - The media record's primary key.
 * @returns {Object|null} The media row, or null if not found.
 */

export default function (id) {
  const [kojo, logger] = this;
  const db = kojo.get('db');

  logger.debug(`[getMediaById] id=${id}`);

  const media = db.prepare('SELECT * FROM media WHERE id = ?').get(Number(id));
  if (!media) {
    logger.debug(`[getMediaById] not found: id=${id}`);
    return null;
  }

  logger.debug(`[getMediaById] found: id=${id} title="${media.title}" status=${media.status} type=${media.type}`);

  if (media.status === 'error') {
    logger.debug(`[getMediaById] status=error, fetching job error for id=${id}`);
    const job = db.prepare(
      "SELECT error FROM jobs WHERE media_id = ? AND status = 'failed' ORDER BY updated_at DESC LIMIT 1"
    ).get(Number(id));
    if (job?.error) {
      logger.debug(`[getMediaById] job error: ${job.error}`);
      media.job_error = job.error;
    } else {
      logger.debug(`[getMediaById] no job error found for id=${id}`);
    }
  }

  return media;
}
