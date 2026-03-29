/**
 * @file Infuse a media item with magic dust.
 *
 * Kojo op: accessed as `kojo.ops.infuseMedia(id, amount)`.
 * Must use `function()` syntax (not arrow) to receive kojo context via `this`.
 *
 * @param {number|string} id - The media record's primary key.
 * @param {number} [amount=1] - Dust to spend / infusion to add.
 * @returns {{ media: object, dust: number }|null} null if not found/insufficient dust.
 */

export default function (id, amount = 1) {
  const [kojo] = this;
  const db = kojo.get('db');
  const mediaId = Number(id);
  const n = Math.max(1, Math.floor(amount));

  const dustResult = kojo.ops.updateDust(-n);
  if (!dustResult) return null;

  const { changes } = db.prepare(
    "UPDATE media SET infusion = infusion + ?, updated_at = datetime('now') WHERE id = ?"
  ).run(n, mediaId);

  if (changes === 0) {
    kojo.ops.updateDust(n);
    return null;
  }

  const media = db.prepare('SELECT * FROM media WHERE id = ?').get(mediaId);
  return { media, dust: dustResult.dust };
}
