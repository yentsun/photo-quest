/**
 * @file Local-only mutations against IndexedDB.
 *
 * No server calls. A future sync pass will reconcile.
 */

import { CARD_TYPE } from '@photo-quest/shared';
import { openDb, STORES } from './localDb.js';
import { emitMutation } from './events.js';

function txn(db, stores, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let result;
    t.oncomplete = () => resolve(result);
    t.onerror    = () => reject(t.error);
    t.onabort    = () => reject(t.error);
    Promise.resolve(fn(t)).then(v => { result = v; }).catch(reject);
  });
}

function req(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror   = () => reject(r.error);
  });
}

/**
 * Add an inventory card to a deck. Writes:
 *   - deckCards: new row joining the card's media fields with deck_id
 *   - decks: bump cardCount (and preview if empty)
 *   - decks[__meta].groupedIds: add inventory_id so it's filtered from inventory
 */
export async function addToDeck(deckId, inventoryId) {
  const db = await openDb();
  await txn(db, [STORES.CARDS, STORES.DECKS, STORES.DECK_CARDS], 'readwrite', async (t) => {
    const cardsOS     = t.objectStore(STORES.CARDS);
    const decksOS     = t.objectStore(STORES.DECKS);
    const deckCardsOS = t.objectStore(STORES.DECK_CARDS);

    const card = await req(cardsOS.get(inventoryId));
    if (!card) throw new Error(`Card ${inventoryId} not found`);

    const existing = await req(deckCardsOS.get(inventoryId));
    if (existing?.deck_id === deckId) return;

    /* A card belongs to at most one deck — drop any prior membership. */
    if (existing) deckCardsOS.delete(inventoryId);

    deckCardsOS.put({
      deck_id: deckId,
      inventory_id: inventoryId,
      acquired_at: card.acquired_at,
      ...card,
    });

    const deck = await req(decksOS.get(deckId));
    if (deck) {
      const updated = {
        ...deck,
        cardCount: (deck.cardCount || 0) + (existing?.deck_id === deckId ? 0 : 1),
      };
      if (card.card_type === 'media' && card.id) {
        updated.preview = { id: card.id, type: card.type, title: card.title };
      }
      decksOS.put(updated);
    }

    /* If the card was moving from another deck, decrement that deck's count. */
    if (existing && existing.deck_id !== deckId) {
      const prevDeck = await req(decksOS.get(existing.deck_id));
      if (prevDeck) decksOS.put({ ...prevDeck, cardCount: Math.max(0, (prevDeck.cardCount || 1) - 1) });
    }

    /* Update groupedIds meta so InventoryPage filters this card out. */
    const meta = (await req(decksOS.get(0))) || { id: 0, __meta: true, groupedIds: [] };
    const grouped = new Set(meta.groupedIds || []);
    grouped.add(inventoryId);
    decksOS.put({ ...meta, groupedIds: [...grouped] });
  });
  emitMutation();
}

/**
 * Consume the oldest quest-deck inventory row and return it. The caller
 * navigates to the quest view with the returned row (ref_id = quest_deck id).
 */
export async function consumeQuestDeck() {
  const db = await openDb();
  const target = await txn(db, [STORES.CARDS], 'readwrite', async (t) => {
    const all = await req(t.objectStore(STORES.CARDS).getAll());
    const questDecks = all
      .filter(r => r.card_type === CARD_TYPE.QUEST_DECK)
      .sort((a, b) => (a.acquired_at || '').localeCompare(b.acquired_at || ''));
    const first = questDecks[0];
    if (!first) throw new Error('No quest decks to consume');
    t.objectStore(STORES.CARDS).delete(first.inventory_id);
    return first;
  });
  emitMutation();
  return target;
}
