/**
 * @file Advance to the next card in a quest deck.
 *
 * Kojo op: accessed as `kojo.ops.advanceQuestDeck(deckId)`.
 * Must use `function()` syntax (not arrow) to receive kojo context via `this`.
 *
 * Increments current_position. If all cards have been viewed, marks the deck
 * as exhausted and removes the deck card from inventory.
 *
 * @param {number} deckId
 * @returns {object|null} Updated deck state via getQuestDeck, or null if not found/already exhausted.
 */

import { CARD_TYPE } from '@photo-quest/shared';

export default function (deckId) {
  const [kojo] = this;
  const db = kojo.get('db');

  const deck = db.prepare('SELECT * FROM quest_decks WHERE id = ?').get(Number(deckId));
  if (!deck || deck.exhausted) return null;

  const totalCards = db.prepare(
    'SELECT COUNT(*) AS count FROM quest_cards WHERE deck_id = ?'
  ).get(deck.id).count;

  const nextPosition = deck.current_position + 1;

  const exhausted = nextPosition >= totalCards ? 1 : 0;
  db.prepare(
    'UPDATE quest_decks SET current_position = ?, exhausted = ? WHERE id = ?'
  ).run(nextPosition, exhausted, deck.id);

  if (exhausted) {
    db.prepare(
      'DELETE FROM inventory WHERE card_type = ? AND ref_id = ?'
    ).run(CARD_TYPE.QUEST_DECK, deck.id);
  }

  return kojo.ops.getQuestDeck(deck.id);
}
