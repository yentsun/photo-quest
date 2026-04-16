/**
 * @file Optimistic IDB writes; mutations go through the sync queue in
 * `sync.js`. Server truth returns via the queue's `then` refetches or
 * via SSE-triggered resyncs — never synchronously from these actions.
 */

import { CARD_TYPE, MARKET_PRICES } from '@photo-quest/shared';
import { openDb, STORES } from './localDb.js';
import { mutate } from './sync.js';
import { emitMutation } from './events.js';

const PLAYER_STATS_KEY = 1;

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

async function readRow(store, key) {
  const db = await openDb();
  return txn(db, [store], 'readonly', (t) => req(t.objectStore(store).get(key)));
}
async function putRow(store, row) {
  const db = await openDb();
  await txn(db, [store], 'readwrite', (t) => { t.objectStore(store).put(row); });
}

async function adjustDust(delta) {
  const db = await openDb();
  await txn(db, [STORES.PLAYER_STATS], 'readwrite', async (t) => {
    const os = t.objectStore(STORES.PLAYER_STATS);
    const row = (await req(os.get(PLAYER_STATS_KEY))) || { id: PLAYER_STATS_KEY, dust: 0 };
    os.put({ ...row, dust: Math.max(0, (row.dust || 0) + delta) });
  });
}

/* ── Decks ─────────────────────────────────────────────────────── */

/**
 * Add an inventory card to a deck. A card belongs to at most one deck —
 * if it's already in another, move it (and decrement the prior deck's
 * count). Bumps the target deck's cardCount and updates its preview when
 * it previously had none.
 */
export async function addToDeck(deckId, inventoryId) {
  console.debug('[addToDeck] start', { deckId, inventoryId });
  const db = await openDb();
  try {
    await txn(db, [STORES.CARDS, STORES.DECK_CARDS, STORES.DECKS], 'readwrite', async (t) => {
      const cardsOS     = t.objectStore(STORES.CARDS);
      const decksOS     = t.objectStore(STORES.DECKS);
      const deckCardsOS = t.objectStore(STORES.DECK_CARDS);

      const card = await req(cardsOS.get(inventoryId));
      console.debug('[addToDeck] fetched card', card);
      if (!card) { console.warn('[addToDeck] no card found, bailing'); return; }

      const existing = await req(deckCardsOS.get(inventoryId));
      console.debug('[addToDeck] existing deckCards row', existing);
      if (existing?.deck_id === deckId) { console.debug('[addToDeck] already in this deck, bailing'); return; }

      if (existing) deckCardsOS.delete(inventoryId);
      /* Use Date.now() as the optimistic deck_card_id so this row ranks
       * newest-first for preview computation (InventoryPage sorts by it).
       * The server's real dc.id replaces it on resync. */
      const row = { ...card, deck_id: deckId, inventory_id: inventoryId, deck_card_id: Date.now() };
      console.debug('[addToDeck] putting row', JSON.parse(JSON.stringify(row)));
      deckCardsOS.put(row);

      const deck = await req(decksOS.get(deckId));
      if (deck) decksOS.put({ ...deck, cardCount: (deck.cardCount || 0) + 1 });

      if (existing && existing.deck_id !== deckId) {
        const prevDeck = await req(decksOS.get(existing.deck_id));
        if (prevDeck) {
          decksOS.put({ ...prevDeck, cardCount: Math.max(0, (prevDeck.cardCount || 1) - 1) });
        }
      }
    });
    console.debug('[addToDeck] txn committed');
  } catch (err) {
    console.error('[addToDeck] txn FAILED', err);
    throw err;
  }
  emitMutation();
  return mutate({
    method: 'POST',
    path:   `/decks/${deckId}/cards`,
    body:   { inventoryIds: [inventoryId] },
  });
}

export async function createDeck(name, inventoryIds = []) {
  return mutate({ method: 'POST', path: '/decks', body: { name, inventoryIds } });
}

/* ── Market ────────────────────────────────────────────────────── */

/**
 * Optimistic inventory insert for market buys. Uses a negative temp
 * inventory_id so it never collides with server-assigned positive ids.
 * `_pending: true` signals UI that the row is awaiting server-side
 * construction (quest decks need cards sampled); `ref_id: null` is the
 * cue startQuest uses to refuse to open the deck yet.
 */
async function optimisticCard(card) {
  const db = await openDb();
  await txn(db, [STORES.CARDS], 'readwrite', (t) => {
    t.objectStore(STORES.CARDS).put(card);
  });
}

export async function buyQuestDeck() {
  await adjustDust(-MARKET_PRICES.questDeck);
  await optimisticCard({
    inventory_id: -Date.now(),
    card_type:    CARD_TYPE.QUEST_DECK,
    ref_id:       null,
    acquired_at:  new Date().toISOString(),
    _pending:     true,
  });
  emitMutation();
  /* Player is waiting on this to become playable — bypass the tick. */
  return mutate({ method: 'POST', path: '/market/buy-deck', flush: true });
}

export async function buyTicket() {
  await adjustDust(-MARKET_PRICES.memoryTicket);
  await optimisticCard({
    inventory_id: -Date.now(),
    card_type:    CARD_TYPE.MEMORY_TICKET,
    ref_id:       null,
    acquired_at:  new Date().toISOString(),
    _pending:     true,
  });
  emitMutation();
  return mutate({ method: 'POST', path: '/market/buy-ticket', flush: true });
}

/* ── Quests ────────────────────────────────────────────────────── */

/** Drop the current card, promote `nextCard`. Recomputes takeCost + canTake.
 *  Doesn't touch `exhausted` — only the server's refetch can confirm the
 *  deck is empty. A locally-null nextCard just means "next card unknown
 *  until refetch"; treating it as exhausted would prematurely bounce the
 *  user out (violates LAW 1.38). */
function advancedState(state, { consumedFreeTake = false } = {}) {
  const nextCard = state.nextCard || null;
  const freeTakeUsed = state.freeTakeUsed || consumedFreeTake;
  const infusion = nextCard?.infusion || 0;
  const isFree   = infusion === 0;
  return {
    ...state,
    currentPosition: state.currentPosition + 1,
    currentCard:     nextCard,
    nextCard:        null,
    takeCost:        isFree ? 0 : infusion * 2,
    canTake:         !isFree || !freeTakeUsed,
    freeTakeUsed,
  };
}

const questRefetch = (deckId) => ({
  method: 'GET',
  path:   `/quest/decks/${deckId}`,
  store:  STORES.QUEST_STATE,
});

/** Remove the consumed quest-deck inventory card after server-confirmed
 *  exhaustion — mirrors server-side `DELETE FROM inventory WHERE ref_id = ?`
 *  so the user doesn't briefly see the stale card on bounce-back. */
export async function consumeExhaustedQuestDeck(questDeckId) {
  const db = await openDb();
  await txn(db, [STORES.CARDS], 'readwrite', async (t) => {
    const os = t.objectStore(STORES.CARDS);
    const all = await req(os.getAll());
    for (const row of all) {
      if (row.card_type === CARD_TYPE.QUEST_DECK && row.ref_id === questDeckId) {
        os.delete(row.inventory_id);
      }
    }
  });
  emitMutation();
}

export async function startQuest() {
  const db = await openDb();
  const row = await txn(db, [STORES.CARDS], 'readonly', async (t) => {
    const all = await req(t.objectStore(STORES.CARDS).getAll());
    return all
      .filter(r => r.card_type === CARD_TYPE.QUEST_DECK && !r._pending && r.ref_id)
      .sort((a, b) => (a.acquired_at || '').localeCompare(b.acquired_at || ''))[0];
  });
  if (!row) throw new Error('No quest decks to open');
  const deckId = row.ref_id;

  const state = await mutate({ method: 'GET', path: `/quest/decks/${deckId}` });
  await putRow(STORES.QUEST_STATE, state);
  emitMutation();
  return deckId;
}

export async function advanceQuest(deckId) {
  const prev = await readRow(STORES.QUEST_STATE, deckId);
  if (!prev) throw new Error('Quest deck not found');
  await putRow(STORES.QUEST_STATE, advancedState(prev));
  emitMutation();
  return mutate({
    method: 'POST',
    path:   `/quest/decks/${deckId}/next`,
    then:   questRefetch(deckId),
  });
}

export async function takeQuest(deckId) {
  const prev = await readRow(STORES.QUEST_STATE, deckId);
  if (!prev?.currentCard) throw new Error('Quest deck exhausted');
  /* Derive from live infusion, not cached takeCost — passive infusion
   * may have bumped the card since the last server refetch. */
  const infusion = prev.currentCard.infusion || 0;
  const cost = infusion === 0 ? 0 : infusion * 2;
  const consumedFreeTake = cost === 0 && !prev.freeTakeUsed;
  const db = await openDb();
  await txn(db, [STORES.PLAYER_STATS, STORES.QUEST_STATE], 'readwrite', async (t) => {
    const ps  = t.objectStore(STORES.PLAYER_STATS);
    const row = (await req(ps.get(PLAYER_STATS_KEY))) || { id: PLAYER_STATS_KEY, dust: 0 };
    ps.put({ ...row, dust: Math.max(0, (row.dust || 0) - cost) });
    t.objectStore(STORES.QUEST_STATE).put(advancedState(prev, { consumedFreeTake }));
  });
  emitMutation();
  return mutate({
    method: 'POST',
    path:   `/quest/decks/${deckId}/take`,
    then:   questRefetch(deckId),
  });
}

export async function destroyQuest(deckId) {
  const prev = await readRow(STORES.QUEST_STATE, deckId);
  if (!prev?.currentCard) throw new Error('Quest deck exhausted');
  const reward = Math.max(2, (prev.currentCard.infusion || 0) * 2);
  const db = await openDb();
  await txn(db, [STORES.PLAYER_STATS, STORES.QUEST_STATE], 'readwrite', async (t) => {
    const ps  = t.objectStore(STORES.PLAYER_STATS);
    const row = (await req(ps.get(PLAYER_STATS_KEY))) || { id: PLAYER_STATS_KEY, dust: 0 };
    ps.put({ ...row, dust: (row.dust || 0) + reward });
    t.objectStore(STORES.QUEST_STATE).put(advancedState(prev));
  });
  emitMutation();
  return mutate({
    method: 'POST',
    path:   `/quest/decks/${deckId}/destroy`,
    then:   questRefetch(deckId),
  });
}

/** Sell a card back to the library. Reward = infusion (LAW 4.15). */
export async function sellCard(inventoryId) {
  const db = await openDb();
  const mediaId = await txn(db, [STORES.CARDS, STORES.DECK_CARDS, STORES.PLAYER_STATS], 'readwrite', async (t) => {
    const cards = t.objectStore(STORES.CARDS);
    const row = await req(cards.get(inventoryId));
    if (!row) return null;
    const reward = row.infusion || 0;
    cards.delete(inventoryId);
    t.objectStore(STORES.DECK_CARDS).delete(inventoryId);
    const ps  = t.objectStore(STORES.PLAYER_STATS);
    const pl  = (await req(ps.get(PLAYER_STATS_KEY))) || { id: PLAYER_STATS_KEY, dust: 0 };
    ps.put({ ...pl, dust: (pl.dust || 0) + reward });
    return row.id;
  });
  if (!mediaId) return;
  emitMutation();
  return mutate({ method: 'POST', path: `/inventory/${inventoryId}/sell` });
}

/** Destroy a card: remove from inventory + delete file from disk. Reward = max(2, infusion*2) (LAW 4.10). */
export async function destroyCard(inventoryId) {
  const db = await openDb();
  const deleted = await txn(db, [STORES.CARDS, STORES.DECK_CARDS, STORES.PLAYER_STATS], 'readwrite', async (t) => {
    const cards = t.objectStore(STORES.CARDS);
    const row = await req(cards.get(inventoryId));
    if (!row) return false;
    const reward = Math.max(2, (row.infusion || 0) * 2);
    cards.delete(inventoryId);
    t.objectStore(STORES.DECK_CARDS).delete(inventoryId);
    const ps = t.objectStore(STORES.PLAYER_STATS);
    const pl = (await req(ps.get(PLAYER_STATS_KEY))) || { id: PLAYER_STATS_KEY, dust: 0 };
    ps.put({ ...pl, dust: (pl.dust || 0) + reward });
    return true;
  });
  if (!deleted) return;
  emitMutation();
  return mutate({ method: 'DELETE', path: `/inventory/${inventoryId}/destroy` });
}

export async function renameCard(inventoryId, title) {
  const clean = (title || '').trim();
  if (!clean) return;
  const db = await openDb();
  const mediaId = await txn(db, [STORES.CARDS, STORES.DECK_CARDS], 'readwrite', async (t) => {
    const cards = t.objectStore(STORES.CARDS);
    const row = await req(cards.get(inventoryId));
    if (!row?.id) return null;
    if (row.title === clean) return row.id;
    cards.put({ ...row, title: clean });

    const deckRow = await req(t.objectStore(STORES.DECK_CARDS).get(inventoryId));
    if (deckRow) t.objectStore(STORES.DECK_CARDS).put({ ...deckRow, title: clean });
    return row.id;
  });
  if (!mediaId) return;
  emitMutation();
  return mutate({ method: 'PATCH', path: `/media/${mediaId}/rename`, body: { title: clean } });
}

/* Free-infuse fires very often (5 s ticks); don't version-bump server
 * side, so per-tick writes don't trigger resyncs. */
export async function freeInfuseCard(inventoryId, amount = 1) {
  const db = await openDb();
  const mediaId = await txn(db, [STORES.CARDS, STORES.DECK_CARDS], 'readwrite', async (t) => {
    const cards = t.objectStore(STORES.CARDS);
    const row = await req(cards.get(inventoryId));
    if (!row?.id) return null;
    cards.put({ ...row, infusion: (row.infusion || 0) + amount });

    const deckRow = await req(t.objectStore(STORES.DECK_CARDS).get(inventoryId));
    if (deckRow) {
      t.objectStore(STORES.DECK_CARDS).put({ ...deckRow, infusion: (deckRow.infusion || 0) + amount });
    }
    return row.id;
  });
  if (!mediaId) return;
  emitMutation();
  mutate({ method: 'PATCH', path: `/media/${mediaId}/free-infuse`, body: { amount } });
}

export async function freeInfuseQuest(deckId, mediaId, amount = 1) {
  const state = await readRow(STORES.QUEST_STATE, deckId);
  if (state?.currentCard?.id === mediaId) {
    await putRow(STORES.QUEST_STATE, {
      ...state,
      currentCard: { ...state.currentCard, infusion: (state.currentCard.infusion || 0) + amount },
    });
    emitMutation();
  }
  mutate({ method: 'PATCH', path: `/media/${mediaId}/free-infuse`, body: { amount } });
}
