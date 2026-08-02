/**
 * @file List all tags with their usage counts.
 *
 * Kojo op: accessed as `kojo.ops.listTags()`.
 * Uses json_each() to expand the JSON tags array and aggregate by value.
 */

export default function () {
  const [kojo, logger] = this;
  const db = kojo.get('db');

  logger.debug(`[listTags] querying`);
  const tags = db.prepare(`
    SELECT
      t.tag,
      t.count,
      m.id AS previewMediaId,
      m.thumbnail_time AS previewThumbnailTime
    FROM (
      SELECT value AS tag, COUNT(*) AS count
      FROM media, json_each(media.tags)
      WHERE hidden = 0
      GROUP BY value
    ) t
    LEFT JOIN media m ON m.id = (
      SELECT m2.id
      FROM media m2, json_each(m2.tags) je
      WHERE je.value = t.tag AND m2.hidden = 0
      ORDER BY m2.updated_at DESC
      LIMIT 1
    )
    ORDER BY t.count DESC, t.tag ASC
  `).all();
  logger.debug(`[listTags] returned ${tags.length} tags`);
  return tags;
}
