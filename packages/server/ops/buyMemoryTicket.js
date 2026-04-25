/**
 * @file Buy a memory game ticket (stored as inventory card).
 *
 * At purchase time we also form the game — sample 8 images weighted
 * by infusion and persist them as `memory_game_cards`. The inventory
 * ticket's `ref_id` points at the game so the client can play offline
 * once the ticket sync lands.
 *
 * Kojo op: accessed as `kojo.ops.buyMemoryTicket()`.
 * Must use `function()` syntax (not arrow) to receive kojo context via `this`.
 *
 * @returns {{ tickets: number, dust: number }|null} null if insufficient dust or not enough images.
 */

import { MARKET_PRICES, CARD_TYPE, MEDIA_TYPE } from '@photo-quest/shared';

const PAIR_COUNT = 8;

function weightedPick(pool, count) {
  const bag = pool.map(m => ({ ...m, weight: (m.infusion || 0) + 1 }));
  const picked = [];
  for (let i = 0; i < count && bag.length > 0; i++) {
    const total = bag.reduce((s, m) => s + m.weight, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (; idx < bag.length - 1; idx++) {
      r -= bag[idx].weight;
      if (r <= 0) break;
    }
    picked.push(bag[idx]);
    bag.splice(idx, 1);
  }
  return picked;
}

export default function () {
  const [kojo] = this;
  const db = kojo.get('db');

  /* LAW 4.26: sample only from non-owned library images; refuse the
   * purchase if the pool can't fill all 8 pairs. */
  const images = db.prepare(
    `SELECT id, infusion FROM media
     WHERE type = ? AND (hidden IS NULL OR hidden = 0)
       AND id NOT IN (SELECT media_id FROM inventory WHERE media_id IS NOT NULL)`
  ).all(MEDIA_TYPE.IMAGE);
  if (images.length < PAIR_COUNT) return null;

  const dustResult = kojo.ops.updateDust(-MARKET_PRICES.memoryTicket);
  if (!dustResult) return null;

  db.exec('BEGIN');
  try {
    const gameResult = db.prepare(
      'INSERT INTO memory_games DEFAULT VALUES'
    ).run();
    const gameId = Number(gameResult.lastInsertRowid);

    const picked = weightedPick(images, PAIR_COUNT);
    const stmt = db.prepare('INSERT INTO memory_game_cards (game_id, media_id) VALUES (?, ?)');
    for (const m of picked) stmt.run(gameId, m.id);

    db.prepare(
      'INSERT INTO inventory (card_type, ref_id) VALUES (?, ?)'
    ).run(CARD_TYPE.MEMORY_TICKET, gameId);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    kojo.ops.updateDust(MARKET_PRICES.memoryTicket); /* refund */
    throw err;
  }

  const { tickets } = kojo.ops.getMemoryTickets();
  return { tickets, dust: dustResult.dust };
}
