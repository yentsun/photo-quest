/**
 * @file Rename a deck.
 *
 * Kojo op: accessed as `kojo.ops.renamePile(id, name)`.
 */

export default function (id, name) {
  const [kojo] = this;
  const db = kojo.get('db');

  const { changes } = db.prepare('UPDATE decks SET name = ? WHERE id = ?').run(name, Number(id));
  return changes > 0;
}
