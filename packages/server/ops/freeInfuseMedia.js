/**
 * @file Infuse a media item without spending dust (passive viewing reward).
 *
 * Kojo op: accessed as `kojo.ops.freeInfuseMedia(id, amount)`.
 * Must use `function()` syntax (not arrow) to receive kojo context via `this`.
 *
 * @param {number|string} id - The media record's primary key.
 * @param {number} [amount=1] - Infusion to add.
 * @returns {{ media: object }|null} null if media not found.
 */

export default function (id, amount = 1) {
  const [kojo] = this;
  const db = kojo.get('db');
  const mediaId = Number(id);
  const n = Math.max(1, Math.floor(amount));

  const { changes } = db.prepare(
    "UPDATE media SET infusion = infusion + ?, updated_at = datetime('now') WHERE id = ?"
  ).run(n, mediaId);

  if (changes === 0) return null;

  const media = db.prepare('SELECT * FROM media WHERE id = ?').get(mediaId);
  return { media };
}
