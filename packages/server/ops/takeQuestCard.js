/**
 * @file Spend dust to take the current quest card into inventory.
 *
 * Kojo op: accessed as `kojo.ops.takeQuestCard(deckId)`.
 * Must use `function()` syntax (not arrow) to receive kojo context via `this`.
 *
 * Deducts QUEST_CARD_COST dust, adds the current card's media to inventory,
 * then advances to the next card.
 *
 * @param {number} deckId
 * @returns {{ error?: string, deck?: object }|null} null if deck not found.
 */

import { QUEST_CARD_COST } from '@photo-quest/shared';

export default function (deckId) {
  const [kojo] = this;
  const db = kojo.get('db');

  const deck = db.prepare('SELECT * FROM quest_decks WHERE id = ?').get(Number(deckId));
  if (!deck || deck.exhausted) return null;

  const currentCard = db.prepare(
    'SELECT * FROM quest_cards WHERE deck_id = ? AND position = ?'
  ).get(deck.id, deck.current_position);

  if (!currentCard) return null;

  // Check if already in inventory
  const existing = db.prepare(
    'SELECT id FROM inventory WHERE media_id = ?'
  ).get(currentCard.media_id);
  if (existing) {
    return { error: 'Already in inventory' };
  }

  // Deduct dust
  const dustResult = kojo.ops.updateDust(-QUEST_CARD_COST);
  if (!dustResult) {
    return { error: 'Insufficient magic dust' };
  }

  // Add to inventory
  kojo.ops.addToInventory(currentCard.media_id);

  // Advance to next card
  return { deck: kojo.ops.advanceQuestDeck(deck.id) };
}
