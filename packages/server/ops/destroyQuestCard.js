/**
 * @file Destroy the current card in a quest deck — delete from DB/disk, award dust, advance.
 *
 * Kojo op: accessed as `kojo.ops.destroyQuestCard(deckId)`.
 * Must use `function()` syntax (not arrow) to receive kojo context via `this`.
 *
 * LAW 4.16: awards the card's infusion value as dust (0-infusion cards yield 0).
 * After destruction the deck advances to the next card.
 *
 * @param {number} deckId
 * @returns {object|null} { dustAwarded, deck } or null if not found/exhausted.
 */

import { CARD_TYPE } from '@photo-quest/shared';

export default function (deckId) {
  const [kojo] = this;
  const db = kojo.get('db');

  const deck = db.prepare('SELECT * FROM quest_decks WHERE id = ?').get(Number(deckId));
  if (!deck || deck.exhausted) return null;

  const currentCard = db.prepare(
    `SELECT qc.id AS card_id, qc.position, m.id AS media_id, m.infusion
     FROM quest_cards qc
     JOIN media m ON m.id = qc.media_id
     WHERE qc.deck_id = ? AND qc.position = ?`
  ).get(deck.id, deck.current_position);

  if (!currentCard) return null;

  const infusion = currentCard.infusion || 0;
  const dustAwarded = infusion;

  db.prepare('DELETE FROM quest_cards WHERE id = ?').run(currentCard.card_id);
  db.prepare('DELETE FROM inventory WHERE media_id = ?').run(currentCard.media_id);
  kojo.ops.removeMedia(currentCard.media_id);

  if (dustAwarded > 0) {
    kojo.ops.updateDust(dustAwarded);
  }

  // Reindex positions to stay contiguous after removal
  const remaining = db.prepare(
    'SELECT id FROM quest_cards WHERE deck_id = ? ORDER BY position'
  ).all(deck.id);
  for (let i = 0; i < remaining.length; i++) {
    db.prepare('UPDATE quest_cards SET position = ? WHERE id = ?').run(i, remaining[i].id);
  }

  if (remaining.length === 0 || deck.current_position >= remaining.length) {
    db.prepare('UPDATE quest_decks SET exhausted = 1 WHERE id = ?').run(deck.id);
    db.prepare(
      'DELETE FROM inventory WHERE card_type = ? AND ref_id = ?'
    ).run(CARD_TYPE.QUEST_DECK, deck.id);
  }

  return { dustAwarded, deck: kojo.ops.getQuestDeck(deck.id) };
}
