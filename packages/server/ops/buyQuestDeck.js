/**
 * @file Buy an extra quest deck for today.
 *
 * Kojo op: accessed as `kojo.ops.buyQuestDeck()`.
 * Must use `function()` syntax (not arrow) to receive kojo context via `this`.
 *
 * @returns {{ deck: object, dust: number }|null} null if insufficient dust or no media.
 */

import { MARKET_PRICES, CARD_TYPE } from '@photo-quest/shared';
import { weightedSample } from '../src/weightedSample.js';

const CARDS_PER_DECK = 10;

export default function () {
  const [kojo] = this;
  const db = kojo.get('db');

  /* LAW 4.26: sample only from non-owned library media; refuse
   * the purchase if the pool can't form a full deck. */
  const pool = db.prepare(
    `SELECT id, infusion FROM media
     WHERE hidden = 0
       AND id NOT IN (SELECT media_id FROM inventory WHERE media_id IS NOT NULL)`
  ).all();
  if (pool.length < CARDS_PER_DECK) return null;

  const dustResult = kojo.ops.updateDust(-MARKET_PRICES.questDeck);
  if (!dustResult) return null;

  const today = new Date().toISOString().slice(0, 10);

  db.exec('BEGIN');
  try {
    const { nextIndex } = db.prepare(
      'SELECT COALESCE(MAX(deck_index), -1) + 1 AS nextIndex FROM quest_decks WHERE date = ?'
    ).get(today);

    const result = db.prepare(
      'INSERT INTO quest_decks (date, deck_index) VALUES (?, ?)'
    ).run(today, nextIndex);
    const deckId = Number(result.lastInsertRowid);

    const picked = weightedSample(pool, CARDS_PER_DECK);
    const stmt = db.prepare('INSERT INTO quest_cards (deck_id, position, media_id) VALUES (?, ?, ?)');
    for (let p = 0; p < picked.length; p++) {
      stmt.run(deckId, p, picked[p].id);
    }

    db.prepare(
      'INSERT INTO inventory (card_type, ref_id) VALUES (?, ?)'
    ).run(CARD_TYPE.QUEST_DECK, deckId);

    db.exec('COMMIT');

    return {
      deck: { id: deckId, deckIndex: nextIndex, currentPosition: 0, totalCards: picked.length },
      dust: dustResult.dust,
    };
  } catch (err) {
    db.exec('ROLLBACK');
    kojo.ops.updateDust(MARKET_PRICES.questDeck);
    throw err;
  }
}
