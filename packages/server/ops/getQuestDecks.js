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

  const result = db.prepare(
    `SELECT d.id, d.deck_index AS deckIndex, d.current_position AS currentPosition,
            COUNT(qc.id) AS totalCards
     FROM quest_decks d
     LEFT JOIN quest_cards qc ON qc.deck_id = d.id
     WHERE d.date = ? AND d.exhausted = 0
     GROUP BY d.id
     ORDER BY d.deck_index`
  ).all(today);

  const { dust } = kojo.ops.getPlayerStats();

  return { decks: result, dust };
}

function generateDecks(db, date) {
  const allMedia = db.prepare(
    'SELECT id, infusion FROM media WHERE hidden = 0'
  ).all();

  if (allMedia.length === 0) return;

  const DECK_COUNT = 10;
  const CARDS_PER_DECK = 10;

  db.exec('BEGIN');
  try {
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
  db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
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
