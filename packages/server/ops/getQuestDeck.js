/**
 * @file Get a specific quest deck with its current card.
 *
 * Kojo op: accessed as `kojo.ops.getQuestDeck(deckId)`.
 * Must use `function()` syntax (not arrow) to receive kojo context via `this`.
 *
 * Auto-skips cards that are already in the player's inventory.
 *
 * @param {number} deckId
 * @returns {object|null} Deck info with current card media, or null if not found.
 */

import { CARD_TYPE } from '@photo-quest/shared';

export default function (deckId) {
  const [kojo] = this;
  const db = kojo.get('db');

  const deck = db.prepare('SELECT * FROM quest_decks WHERE id = ?').get(Number(deckId));
  if (!deck) return null;

  const totalCards = db.prepare(
    'SELECT COUNT(*) AS count FROM quest_cards WHERE deck_id = ?'
  ).get(deck.id).count;

  // Find the next card at or after current_position that isn't in inventory
  let position = deck.current_position;
  let currentCard = null;

  while (position < totalCards) {
    const candidate = db.prepare(
      `SELECT qc.id AS card_id, qc.position, m.*
       FROM quest_cards qc
       JOIN media m ON m.id = qc.media_id
       WHERE qc.deck_id = ? AND qc.position = ?`
    ).get(deck.id, position);

    if (!candidate) break;

    const inInventory = db.prepare(
      'SELECT id FROM inventory WHERE media_id = ?'
    ).get(candidate.id);

    if (!inInventory) {
      currentCard = candidate;
      break;
    }

    position++;
  }

  // If we skipped ahead, persist the new position
  if (position !== deck.current_position) {
    if (position >= totalCards) {
      db.prepare('UPDATE quest_decks SET current_position = ?, exhausted = 1 WHERE id = ?').run(position, deck.id);
      db.prepare('DELETE FROM inventory WHERE card_type = ? AND ref_id = ?').run(CARD_TYPE.QUEST_DECK, deck.id);
    } else {
      db.prepare('UPDATE quest_decks SET current_position = ? WHERE id = ?').run(position, deck.id);
    }
  }

  const { dust } = kojo.ops.getPlayerStats();

  const freeTakeUsed = !!deck.free_take_used;
  let takeCost = 0;
  let canTake = true;
  if (currentCard) {
    const infusion = currentCard.infusion || 0;
    if (infusion === 0 && freeTakeUsed) {
      canTake = false;
    } else {
      takeCost = infusion * 2;
    }
  }

  return {
    id: deck.id,
    deckIndex: deck.deck_index,
    currentPosition: position,
    totalCards,
    exhausted: position >= totalCards,
    currentCard: currentCard || null,
    takeCost,
    canTake,
    freeTakeUsed,
    dust,
  };
}
