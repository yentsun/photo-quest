/**
 * @file Buy an extra quest deck for today.
 *
 * Kojo op: accessed as `kojo.ops.buyQuestDeck()`.
 * Must use `function()` syntax (not arrow) to receive kojo context via `this`.
 *
 * @returns {{ deck: object, dust: number }|null} null if insufficient dust or no media.
 */

import { MARKET_PRICES } from '@photo-quest/shared';
import { weightedSample } from '../src/weightedSample.js';

export default function () {
  const [kojo] = this;
  const db = kojo.get('db');

  const allMedia = db.prepare('SELECT id, infusion FROM media WHERE hidden = 0').all();
  if (allMedia.length === 0) return null;

  const dustResult = kojo.ops.updateDust(-MARKET_PRICES.questDeck);
  if (!dustResult) return null;

  const today = new Date().toISOString().slice(0, 10);
  const CARDS_PER_DECK = 10;

  db.exec('BEGIN');
  try {
    const { nextIndex } = db.prepare(
      'SELECT COALESCE(MAX(deck_index), -1) + 1 AS nextIndex FROM quest_decks WHERE date = ?'
    ).get(today);

    const result = db.prepare(
      'INSERT INTO quest_decks (date, deck_index) VALUES (?, ?)'
    ).run(today, nextIndex);
    const deckId = Number(result.lastInsertRowid);

    const picked = weightedSample(allMedia, Math.min(CARDS_PER_DECK, allMedia.length));
    const stmt = db.prepare('INSERT INTO quest_cards (deck_id, position, media_id) VALUES (?, ?, ?)');
    for (let p = 0; p < picked.length; p++) {
      stmt.run(deckId, p, picked[p].id);
    }

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
