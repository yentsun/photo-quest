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
    SELECT value AS tag, COUNT(*) AS count
    FROM media, json_each(media.tags)
    WHERE hidden = 0
    GROUP BY value
    ORDER BY count DESC, value ASC
  `).all();
  logger.debug(`[listTags] returned ${tags.length} tags`);
  return tags;
}
