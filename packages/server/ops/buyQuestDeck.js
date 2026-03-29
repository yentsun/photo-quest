/**
 * @file Buy an extra quest deck for today.
 *
 * Kojo op: accessed as `kojo.ops.buyQuestDeck()`.
 * Must use `function()` syntax (not arrow) to receive kojo context via `this`.
 *
 * Deducts MARKET_PRICES.questDeck dust, generates one new deck for today.
 *
 * @returns {{ deck: object, dust: number }|null} null if insufficient dust or no media.
 */

import { MARKET_PRICES } from '@photo-quest/shared';

export default function () {
  const [kojo] = this;
  const db = kojo.get('db');

  const dustResult = kojo.ops.updateDust(-MARKET_PRICES.questDeck);
  if (!dustResult) return null;

  const today = new Date().toISOString().slice(0, 10);

  const { nextIndex } = db.prepare(
    'SELECT COALESCE(MAX(deck_index), -1) + 1 AS nextIndex FROM quest_decks WHERE date = ?'
  ).get(today);

  const allMedia = db.prepare('SELECT id, infusion FROM media WHERE hidden = 0').all();
  if (allMedia.length === 0) {
    kojo.ops.updateDust(MARKET_PRICES.questDeck);
    return null;
  }

  const result = db.prepare(
    'INSERT INTO quest_decks (date, deck_index) VALUES (?, ?)'
  ).run(today, nextIndex);
  const deckId = Number(result.lastInsertRowid);

  const CARDS_PER_DECK = 10;
  const picked = weightedSample(allMedia, Math.min(CARDS_PER_DECK, allMedia.length));

  for (let p = 0; p < picked.length; p++) {
    db.prepare(
      'INSERT INTO quest_cards (deck_id, position, media_id) VALUES (?, ?, ?)'
    ).run(deckId, p, picked[p].id);
  }

  return {
    deck: { id: deckId, deckIndex: nextIndex, currentPosition: 0, totalCards: picked.length },
    dust: dustResult.dust,
  };
}

function weightedSample(items, count) {
  const pool = items.map(m => ({ ...m, weight: (m.infusion || 0) + 1 }));
  const picked = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const totalWeight = pool.reduce((sum, m) => sum + m.weight, 0);
    let r = Math.random() * totalWeight;
    let idx = 0;
    for (; idx < pool.length - 1; idx++) {
      r -= pool[idx].weight;
      if (r <= 0) break;
    }
    picked.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return picked;
}
