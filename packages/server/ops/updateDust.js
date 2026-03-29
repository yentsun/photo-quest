/**
 * @file Add or subtract magic dust from the player's balance.
 *
 * Kojo op: accessed as `kojo.ops.updateDust(delta)`.
 * Must use `function()` syntax (not arrow) to receive kojo context via `this`.
 *
 * @param {number} delta - Amount to add (positive) or subtract (negative).
 * @returns {{ dust: number } | null} Updated balance, or null if insufficient funds.
 */

export default function (delta) {
  const [kojo] = this;
  const db = kojo.get('db');

  const { dust } = db.prepare('SELECT dust FROM player_stats WHERE id = 1').get();

  if (dust + delta < 0) return null;

  db.prepare('UPDATE player_stats SET dust = dust + ? WHERE id = 1').run(delta);

  return db.prepare('SELECT dust FROM player_stats WHERE id = 1').get();
}
