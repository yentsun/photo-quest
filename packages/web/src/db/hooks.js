/**
 * @file React hooks that read from the local IndexedDB replica.
 *
 * Pages import these instead of calling `utils/api.js` directly. Each hook
 * subscribes to one or more stores via `localDb.subscribe()` and re-runs
 * its query whenever those stores change.
 */

import { useEffect, useState, useRef } from 'react';
import { getAll, getByKey, subscribe, STORES } from './localDb.js';

/* Stable references for hooks that subscribe to multiple stores —
 * avoids re-subscribing on every render. */
const DECKS_STORES = [STORES.DECKS, STORES.META];
const DECK_PAGE_STORES = [STORES.DECKS, STORES.DECK_CARDS];
const QUEST_STORES = [STORES.QUEST_DECKS, STORES.QUEST_CARDS, STORES.INVENTORY, STORES.PLAYER_STATS];

/**
 * Generic live-query hook.
 *
 * @template T
 * @param {string|string[]} stores Stores to subscribe to. Must be a stable
 *   reference (string literal or module-scoped array) — passing a fresh
 *   array each render will re-subscribe every time.
 * @param {() => Promise<T>} queryFn Async query against the local store.
 * @param {T} initial Initial value before the first read resolves.
 * @returns {T}
 */
function useLocal(stores, queryFn, initial) {
  const [data, setData] = useState(initial);
  const queryRef = useRef(queryFn);
  /* Pin queryFn via ref so the effect's deps stay tied to `stores` only.
   * Updated in an effect (not during render) to stay safe under
   * Concurrent Mode and StrictMode double-invocation. */
  useEffect(() => { queryRef.current = queryFn; });

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      Promise.resolve(queryRef.current())
        .then(d => { if (!cancelled) setData(d); })
        .catch(err => console.error('useLocal query failed:', err));
    };
    run();
    const unsub = subscribe(stores, run);
    return () => { cancelled = true; unsub(); };
  }, [stores]);

  return data;
}

/**
 * Inventory items as returned by `GET /inventory`. Shape matches what
 * `InventoryPage` already expects.
 *
 * @returns {{ items: object[], total: number }}
 */
export function useInventory() {
  return useLocal(
    STORES.INVENTORY,
    async () => {
      const items = await getAll(STORES.INVENTORY);
      return { items, total: items.length };
    },
    { items: [], total: 0 },
  );
}

/**
 * User decks plus the `groupedIds` set so pages can filter ungrouped
 * inventory cards.
 *
 * @returns {{ piles: object[], groupedIds: Set<number> }}
 */
export function useDecks() {
  return useLocal(
    DECKS_STORES,
    async () => {
      const [piles, groupedRow] = await Promise.all([
        getAll(STORES.DECKS),
        getByKey(STORES.META, 'groupedIds'),
      ]);
      return { piles, groupedIds: new Set(groupedRow?.value || []) };
    },
    { piles: [], groupedIds: new Set() },
  );
}

/**
 * Cards in a single user deck plus the deck's name. Returns `null`
 * until the deck row has synced.
 *
 * @param {number|string|null} deckId
 */
export function useDeckCards(deckId) {
  return useLocal(
    DECK_PAGE_STORES,
    async () => {
      if (deckId == null) return null;
      const id = Number(deckId);
      const [deck, allCards] = await Promise.all([
        getByKey(STORES.DECKS, id),
        getAll(STORES.DECK_CARDS),
      ]);
      if (!deck) return null;
      const cards = allCards.filter(c => c.deck_id === id);
      return { name: deck.name, cards };
    },
    null,
  );
}

/**
 * Singleton player stats. Returns `null` until the first sync completes
 * so the dust badge can hide instead of flashing 0.
 *
 * @returns {{ dust: number } | null}
 */
export function usePlayerStats() {
  return useLocal(
    STORES.PLAYER_STATS,
    async () => {
      const row = await getByKey(STORES.PLAYER_STATS, 1);
      return row ? { dust: row.dust } : null;
    },
    null,
  );
}

/**
 * Compose the quest-deck view shape that QuestPage expects from local
 * stores. Skips quest cards whose media is already owned (mirrors the
 * server's `findNextUnownedCard`), computes takeCost / canTake from the
 * current card's infusion and the deck's free_take_used flag.
 *
 * Returns `null` while the deck row hasn't synced yet, and an object with
 * `exhausted: true` once the player has run through all unowned cards.
 *
 * @param {number|null} deckId
 */
export function useQuestDeck(deckId) {
  return useLocal(
    QUEST_STORES,
    async () => {
      if (deckId == null) return null;
      const [deck, allCards, inventory, stats] = await Promise.all([
        getByKey(STORES.QUEST_DECKS, Number(deckId)),
        getAll(STORES.QUEST_CARDS),
        getAll(STORES.INVENTORY),
        getByKey(STORES.PLAYER_STATS, 1),
      ]);
      if (!deck) return null;

      const ownedMediaIds = new Set(
        inventory.filter(i => i.media_id != null).map(i => i.media_id),
      );
      const cards = allCards
        .filter(c => c.deck_id === deck.id)
        .sort((a, b) => a.position - b.position);

      const findNextUnowned = (fromPos) =>
        cards.find(c => c.position >= fromPos && !ownedMediaIds.has(c.media_id)) || null;

      const currentCard = findNextUnowned(deck.current_position);
      const position = currentCard ? currentCard.position : deck.total_cards;
      const exhausted = position >= deck.total_cards;
      const nextCard = currentCard ? findNextUnowned(position + 1) : null;

      const freeTakeUsed = !!deck.free_take_used;
      let takeCost = 0;
      let canTake = true;
      if (currentCard) {
        const infusion = currentCard.infusion || 0;
        if (infusion === 0 && freeTakeUsed) canTake = false;
        else takeCost = infusion * 2;
      }

      return {
        id: deck.id,
        deckIndex: deck.deck_index,
        currentPosition: position,
        totalCards: deck.total_cards,
        exhausted,
        currentCard,
        nextCard,
        takeCost,
        canTake,
        freeTakeUsed,
        dust: stats?.dust ?? 0,
      };
    },
    null,
  );
}
