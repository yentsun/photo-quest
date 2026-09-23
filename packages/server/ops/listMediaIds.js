/**
 * @file List every visible media id.
 *
 * Kojo op: accessed as `kojo.ops.listMediaIds()`.
 *
 * Used by the client to prune its IndexedDB snapshot of records the server no
 * longer has (deleted, merged or cleaned up while it was offline/away), so a
 * removed item never lingers in a grid.
 *
 * @returns {number[]} Ascending media ids where hidden = 0.
 */

export default function listMediaIds() {
  const [kojo, logger] = this;
  const db = kojo.get('db');

  const ids = db.prepare('SELECT id FROM media WHERE hidden = 0 ORDER BY id').all().map(row => row.id);
  logger.debug(`[listMediaIds] ${ids.length} id(s)`);
  return ids;
}
