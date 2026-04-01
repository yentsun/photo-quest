/**
 * @file Rename a media item's title.
 *
 * Kojo op: accessed as `kojo.ops.renameMedia(id, title)`.
 * Must use `function()` syntax (not arrow) to receive kojo context via `this`.
 *
 * First rename grants +10 infusion (title_edited flag prevents repeats).
 *
 * @param {number} id - Media record ID.
 * @param {string} title - New title.
 * @returns {{ media: object, infuseBonus: number }|null} null if not found.
 */

export default function (id, title) {
  const [kojo] = this;
  const db = kojo.get('db');
  const mediaId = Number(id);

  const row = db.prepare('SELECT title_edited FROM media WHERE id = ?').get(mediaId);
  if (!row) return null;

  const firstEdit = !row.title_edited;
  const infuseBonus = firstEdit ? 10 : 0;

  db.prepare(
    `UPDATE media SET title = ?, title_edited = 1, infusion = infusion + ?,
     updated_at = datetime('now') WHERE id = ?`
  ).run(title, infuseBonus, mediaId);

  const media = db.prepare('SELECT * FROM media WHERE id = ?').get(mediaId);
  return { media, infuseBonus };
}
