/**
 * @file Get today's quest decks, generating them if they don't exist yet.
 *
 * Kojo op: accessed as `kojo.ops.getQuestDecks()`.
 * Must use `function()` syntax (not arrow) to receive kojo context via `this`.
 *
 * Generates 10 decks of 10 random cards from the media library.
 * Decks are keyed by date so they persist for the day.
 *
 * @returns {{ decks: object[], dust: number }}
 */

export default function () {
  const [kojo] = this;
  const db = kojo.get('db');

  const today = new Date().toISOString().slice(0, 10);

  const existing = db.prepare(
    'SELECT * FROM quest_decks WHERE date = ? ORDER BY deck_index'
  ).all(today);

  if (existing.length === 0) {
    generateDecks(db, today);
  }

  const decks = db.prepare(
    'SELECT * FROM quest_decks WHERE date = ? AND exhausted = 0 ORDER BY deck_index'
  ).all(today);

  // Attach card count and current card info to each deck
  const result = decks.map(deck => {
    const totalCards = db.prepare(
      'SELECT COUNT(*) AS count FROM quest_cards WHERE deck_id = ?'
    ).get(deck.id).count;

    return {
      id: deck.id,
      deckIndex: deck.deck_index,
      currentPosition: deck.current_position,
      totalCards,
    };
  });

  const { dust } = db.prepare('SELECT dust FROM player_stats WHERE id = 1').get();

  return { decks: result, dust };
}

function generateDecks(db, date) {
  const allMedia = db.prepare(
    'SELECT id, infusion FROM media WHERE hidden = 0'
  ).all();

  if (allMedia.length === 0) return;

  const DECK_COUNT = 10;
  const CARDS_PER_DECK = 10;

  for (let d = 0; d < DECK_COUNT; d++) {
    const result = db.prepare(
      'INSERT INTO quest_decks (date, deck_index) VALUES (?, ?)'
    ).run(date, d);
    const deckId = Number(result.lastInsertRowid);

    const picked = weightedSample(allMedia, Math.min(CARDS_PER_DECK, allMedia.length));

    for (let p = 0; p < picked.length; p++) {
      db.prepare(
        'INSERT INTO quest_cards (deck_id, position, media_id) VALUES (?, ?, ?)'
      ).run(deckId, p, picked[p].id);
    }
  }
}

/**
 * Pick `count` unique items weighted by infusion.
 * Weight = infusion + 1 (so 0-infusion items still appear).
 */
function weightedSample(items, count) {
  const pool = items.map(m => ({ ...m, weight: m.infusion + 1 }));
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
