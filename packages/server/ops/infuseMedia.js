/**
 * @file Infuse a media item with 1 magic dust.
 *
 * Kojo op: accessed as `kojo.ops.infuseMedia(id)`.
 * Must use `function()` syntax (not arrow) to receive kojo context via `this`.
 *
 * Deducts 1 dust from the player and increments the media's infusion value.
 *
 * @param {number|string} id - The media record's primary key.
 * @returns {{ media: object, dust: number }|null} Updated media + dust, or null if not found/insufficient dust.
 */

export default function (id) {
  const [kojo] = this;
  const db = kojo.get('db');

  const media = db.prepare('SELECT * FROM media WHERE id = ?').get(Number(id));
  if (!media) return null;

  // Deduct 1 dust
  const dustResult = kojo.ops.updateDust(-1);
  if (!dustResult) return null;

  db.prepare(
    "UPDATE media SET infusion = infusion + 1, updated_at = datetime('now') WHERE id = ?"
  ).run(Number(id));

  const updated = db.prepare('SELECT * FROM media WHERE id = ?').get(Number(id));
  return { media: updated, dust: dustResult.dust };
}
