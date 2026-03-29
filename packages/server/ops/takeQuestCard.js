/**
 * @file Take the current quest card into inventory.
 *
 * Kojo op: accessed as `kojo.ops.takeQuestCard(deckId)`.
 * Must use `function()` syntax (not arrow) to receive kojo context via `this`.
 *
 * Cost: free if infusion is 0, otherwise infusion × 2.
 * Adds the current card's media to inventory, then advances to the next card.
 *
 * @param {number} deckId
 * @returns {{ error?: string, deck?: object }|null} null if deck not found.
 */

export default function (deckId) {
  const [kojo] = this;
  const db = kojo.get('db');

  const deck = db.prepare('SELECT * FROM quest_decks WHERE id = ?').get(Number(deckId));
  if (!deck || deck.exhausted) return null;

  const currentCard = db.prepare(
    `SELECT qc.*, m.infusion FROM quest_cards qc
     JOIN media m ON m.id = qc.media_id
     WHERE qc.deck_id = ? AND qc.position = ?`
  ).get(deck.id, deck.current_position);

  if (!currentCard) return null;

  // Check if already in inventory
  const existing = db.prepare(
    'SELECT id FROM inventory WHERE media_id = ?'
  ).get(currentCard.media_id);
  if (existing) {
    return { error: 'Already in inventory' };
  }

  // Cost: one free take per deck if 0 infusion, otherwise infusion × 2
  const infusion = currentCard.infusion || 0;
  let cost;
  if (infusion === 0 && !deck.free_take_used) {
    cost = 0;
  } else if (infusion === 0) {
    cost = 1; // free take already used, costs 1 for subsequent 0-infusion cards
  } else {
    cost = infusion * 2;
  }

  if (cost > 0) {
    const dustResult = kojo.ops.updateDust(-cost);
    if (!dustResult) {
      return { error: 'Insufficient magic dust' };
    }
  }

  // Mark free take as used
  if (infusion === 0 && !deck.free_take_used) {
    db.prepare('UPDATE quest_decks SET free_take_used = 1 WHERE id = ?').run(deck.id);
  }

  // Add to inventory
  kojo.ops.addToInventory(currentCard.media_id);

  // Advance to next card
  return { deck: kojo.ops.advanceQuestDeck(deck.id) };
}
