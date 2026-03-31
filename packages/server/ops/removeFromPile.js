/**
 * @file Remove a card from a pile.
 *
 * Kojo op: accessed as `kojo.ops.removeFromPile(pileId, inventoryId)`.
 */

export default function (pileId, inventoryId) {
  const [kojo] = this;
  const db = kojo.get('db');

  const { changes } = db.prepare(
    'DELETE FROM pile_cards WHERE pile_id = ? AND inventory_id = ?'
  ).run(Number(pileId), Number(inventoryId));

  return changes > 0;
}
