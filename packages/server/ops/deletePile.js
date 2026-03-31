/**
 * @file Delete a deck (cards stay in inventory).
 *
 * Kojo op: accessed as `kojo.ops.deletePile(id)`.
 */

export default function (id) {
  const [kojo] = this;
  const db = kojo.get('db');

  const { changes } = db.prepare('DELETE FROM decks WHERE id = ?').run(Number(id));
  return changes > 0;
}
