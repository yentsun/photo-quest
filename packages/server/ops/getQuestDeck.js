/**
 * @file Get a specific quest deck with its current card.
 *
 * Kojo op: accessed as `kojo.ops.getQuestDeck(deckId)`.
 * Must use `function()` syntax (not arrow) to receive kojo context via `this`.
 *
 * @param {number} deckId
 * @returns {object|null} Deck info with current card media, or null if not found.
 */

function getCardAt(db, deckId, position) {
  return db.prepare(
    `SELECT qc.id AS card_id, qc.position, m.*
     FROM quest_cards qc
     JOIN media m ON m.id = qc.media_id
     WHERE qc.deck_id = ? AND qc.position = ?`
  ).get(deckId, position) || null;
}

export default function (deckId) {
  const [kojo] = this;
  const db = kojo.get('db');

  const deck = db.prepare('SELECT * FROM quest_decks WHERE id = ?').get(Number(deckId));
  if (!deck) return null;

  const totalCards = db.prepare(
    'SELECT COUNT(*) AS count FROM quest_cards WHERE deck_id = ?'
  ).get(deck.id).count;

  const position = deck.current_position;
  const currentCard = position < totalCards ? getCardAt(db, deck.id, position) : null;

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

  const nextCard = position + 1 < totalCards ? getCardAt(db, deck.id, position + 1) : null;

  return {
    id: deck.id,
    deckIndex: deck.deck_index,
    currentPosition: position,
    totalCards,
    exhausted: position >= totalCards,
    currentCard,
    nextCard,
    takeCost,
    canTake,
    freeTakeUsed,
    dust,
  };
}
