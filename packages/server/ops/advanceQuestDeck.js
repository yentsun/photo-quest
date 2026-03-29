/**
 * @file Advance to the next card in a quest deck.
 *
 * Kojo op: accessed as `kojo.ops.advanceQuestDeck(deckId)`.
 * Must use `function()` syntax (not arrow) to receive kojo context via `this`.
 *
 * Increments current_position. If all cards have been viewed, marks the deck
 * as exhausted.
 *
 * @param {number} deckId
 * @returns {object|null} Updated deck state via getQuestDeck, or null if not found/already exhausted.
 */

export default function (deckId) {
  const [kojo] = this;
  const db = kojo.get('db');

  const deck = db.prepare('SELECT * FROM quest_decks WHERE id = ?').get(Number(deckId));
  if (!deck || deck.exhausted) return null;

  const totalCards = db.prepare(
    'SELECT COUNT(*) AS count FROM quest_cards WHERE deck_id = ?'
  ).get(deck.id).count;

  const nextPosition = deck.current_position + 1;

  if (nextPosition >= totalCards) {
    db.prepare(
      'UPDATE quest_decks SET current_position = ?, exhausted = 1 WHERE id = ?'
    ).run(nextPosition, deck.id);
  } else {
    db.prepare(
      'UPDATE quest_decks SET current_position = ? WHERE id = ?'
    ).run(nextPosition, deck.id);
  }

  return kojo.ops.getQuestDeck(deck.id);
}
