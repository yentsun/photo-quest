/**
 * @file Fetch a single media record by its numeric ID.
 *
 * Kojo op: accessed as `kojo.ops.getMediaById(id)`.
 *
 * Attaches `folder_chain` (ancestor folders from root to this media's folder)
 * for building breadcrumbs without a separate /folders fetch.
 *
 * @param {number|string} id - The media record's primary key.
 * @returns {Object|null} The media row, or null if not found.
 */

import path from 'node:path';

export default function (id) {
  const [kojo, logger] = this;
  const db = kojo.get('db');
  const sep = path.sep;

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

  if (media.folder) {
    const folder = db.prepare('SELECT id, path, name FROM folders WHERE path = ?').get(media.folder);
    if (folder) {
      media.folder_id = folder.id;
      const chain = [];
      let currentPath = media.folder;
      while (true) {
        const parentPath = path.dirname(currentPath);
        if (parentPath === currentPath) break;
        const ancestor = db.prepare('SELECT id, path, name FROM folders WHERE path = ?').get(parentPath);
        if (!ancestor) break;
        chain.unshift({ id: ancestor.id, path: ancestor.path, name: ancestor.name });
        currentPath = parentPath;
      }
      chain.push({ id: folder.id, path: folder.path, name: folder.name });
      media.folder_chain = chain;
    }
  }

  return media;
}
