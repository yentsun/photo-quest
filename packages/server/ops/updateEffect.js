/**
 * @file Set or clear the animated doodle effect for a media item.
 *
 * Kojo op: accessed as `kojo.ops.updateEffect(id, config)`.
 * The config is stored as a JSON string in `media.effect_config`; `null`
 * clears it. The returned row carries `effect_config` as an object (or null).
 */

export default function (id, config) {
  const [kojo, logger] = this;
  const db = kojo.get('db');

  const json = config == null ? null : JSON.stringify(config);
  logger.debug(`id=${id} effect=${json}`);

  const result = db.prepare(
    "UPDATE media SET effect_config = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(json, Number(id));

  if (result.changes === 0) {
    logger.debug(`not found: id=${id}`);
    return null;
  }

  const media = db.prepare('SELECT * FROM media WHERE id = ?').get(Number(id));
  media.effect_config = media.effect_config ? JSON.parse(media.effect_config) : null;

  logger.debug(`updated: id=${id}`);
  return media;
}
