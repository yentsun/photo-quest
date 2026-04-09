/**
 * @file Get today's quest decks, generating them if they don't exist yet.
 *
 * Kojo op: accessed as `kojo.ops.getQuestDecks()`.
 * Must use `function()` syntax (not arrow) to receive kojo context via `this`.
 *
 * Generates 10 decks of 10 random cards from the media library.
 * Decks are keyed by date so they persist for the day.
 * Each deck is also added to inventory as a quest_deck card.
 *
 * @returns {{ decks: object[], dust: number }}
 */

import { CARD_TYPE } from '@photo-quest/shared';
import { weightedSample } from '../src/weightedSample.js';

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
    `SELECT d.id, d.deck_index, d.current_position, d.exhausted, d.free_take_used,
            COUNT(qc.id) AS total_cards
     FROM quest_decks d
     LEFT JOIN quest_cards qc ON qc.deck_id = d.id
     WHERE d.date = ? AND d.exhausted = 0
     GROUP BY d.id
     ORDER BY d.deck_index`
  ).all(today);

  /* Denormalized cards: each row carries the joined media fields so the
   * client can drive QuestPage entirely from local IDB without a separate
   * media-table sync. */
  const cards = db.prepare(
    `SELECT qc.id AS card_id, qc.deck_id, qc.position, qc.media_id, m.*
     FROM quest_cards qc
     JOIN media m ON m.id = qc.media_id
     JOIN quest_decks d ON d.id = qc.deck_id
     WHERE d.date = ? AND d.exhausted = 0
     ORDER BY qc.deck_id, qc.position`
  ).all(today);

  const { dust } = kojo.ops.getPlayerStats();

  return { decks, cards, dust };
}

function generateDecks(db, date) {
  const allMedia = db.prepare(
    `SELECT id, infusion FROM media
     WHERE hidden = 0 AND id NOT IN (SELECT media_id FROM inventory WHERE media_id IS NOT NULL)`
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

    db.prepare(
      'INSERT INTO inventory (card_type, ref_id) VALUES (?, ?)'
    ).run(CARD_TYPE.QUEST_DECK, deckId);
  }
  db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
