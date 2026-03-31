/**
 * @file Get player stats (magic dust balance).
 *
 * Kojo op: accessed as `kojo.ops.getPlayerStats()`.
 * Must use `function()` syntax (not arrow) to receive kojo context via `this`.
 */

export default function () {
  const [kojo] = this;
  const db = kojo.get('db');

  return db.prepare('SELECT dust FROM player_stats WHERE id = 1').get();
}
