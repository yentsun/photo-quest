/**
 * @file List all tags with their usage counts.
 *
 * Kojo op: accessed as `kojo.ops.listTags()`.
 *
 * Uses a single-pass window function: expands each media's JSON tags array
 * once, numbers rows per tag by recency, then aggregates to get count +
 * the most recently updated media's id + thumbnail_time for each tag.
 */

export default function () {
  const [kojo, logger] = this;
  const db = kojo.get('db');

  logger.debug(`[listTags] querying`);
  const tags = db.prepare(`
    WITH expanded AS (
      SELECT
        m.id,
        je.value AS tag,
        m.updated_at,
        m.thumbnail_time,
        ROW_NUMBER() OVER (PARTITION BY je.value ORDER BY m.updated_at DESC, m.id DESC) AS rn
      FROM media m, json_each(m.tags) je
      WHERE m.hidden = 0
    )
    SELECT
      tag,
      COUNT(*) AS count,
      MAX(CASE WHEN rn = 1 THEN id END) AS previewMediaId,
      MAX(CASE WHEN rn = 1 THEN thumbnail_time END) AS previewThumbnailTime
    FROM expanded
    GROUP BY tag
    ORDER BY count DESC, tag ASC
  `).all();
  logger.debug(`[listTags] returned ${tags.length} tags`);
  return tags;
}
