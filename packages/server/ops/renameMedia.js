/**
 * @file Update the title of a media item.
 *
 * @param {number} id
 * @param {string} title
 * @returns {Object|null} Updated media row, or null if not found.
 */

export default function (id, title) {
  const [kojo, logger] = this;
  const db = kojo.get('db');

  logger.debug(`[renameMedia] id=${id} title="${title}"`);

  const result = db.prepare(
    "UPDATE media SET title = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(String(title).trim(), Number(id));

  if (result.changes === 0) {
    logger.debug(`[renameMedia] not found: id=${id}`);
    return null;
  }

  logger.debug(`[renameMedia] renamed: id=${id}`);
  return db.prepare('SELECT * FROM media WHERE id = ?').get(Number(id));
}
