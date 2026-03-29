/**
 * @file Get a specific quest deck with its current card.
 *
 * Kojo op: accessed as `kojo.ops.getQuestDeck(deckId)`.
 * Must use `function()` syntax (not arrow) to receive kojo context via `this`.
 *
 * @param {number} deckId
 * @returns {object|null} Deck info with current card media, or null if not found.
 */

export default function (deckId) {
  const [kojo] = this;
  const db = kojo.get('db');

  const deck = db.prepare('SELECT * FROM quest_decks WHERE id = ?').get(Number(deckId));
  if (!deck) return null;

  const totalCards = db.prepare(
    'SELECT COUNT(*) AS count FROM quest_cards WHERE deck_id = ?'
  ).get(deck.id).count;

  const currentCard = db.prepare(
    `SELECT qc.id AS card_id, qc.position, m.*
     FROM quest_cards qc
     JOIN media m ON m.id = qc.media_id
     WHERE qc.deck_id = ? AND qc.position = ?`
  ).get(deck.id, deck.current_position);

  // Check if current card is already in inventory
  let inInventory = false;
  if (currentCard) {
    const inv = db.prepare(
      'SELECT id FROM inventory WHERE media_id = ?'
    ).get(currentCard.id);
    inInventory = !!inv;
  }

  const { dust } = kojo.ops.getPlayerStats();

  const freeTakeUsed = !!deck.free_take_used;
  let takeCost = 0;
  let canTake = true;
  if (currentCard) {
    const infusion = currentCard.infusion || 0;
    if (infusion === 0 && freeTakeUsed) {
      canTake = false; // no more free takes, can't buy 0-infusion cards
    } else {
      takeCost = infusion * 2; // 0 for uninfused (free), infusion×2 for infused
    }
  }

  return {
    id: deck.id,
    deckIndex: deck.deck_index,
    currentPosition: deck.current_position,
    totalCards,
    exhausted: !!deck.exhausted,
    currentCard: currentCard || null,
    inInventory,
    takeCost,
    canTake,
    freeTakeUsed,
    dust,
  };
}
