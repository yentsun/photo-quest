/**
 * @file Optimistic IDB writes with background server reconciliation.
 * All HTTP lives in syncWorker.js via `mutate(...)` in sync.js.
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
async function deleteRow(store, key) {
  const db = await openDb();
  await txn(db, [store], 'readwrite', (t) => { t.objectStore(store).delete(key); });
}

/**
 * 1. `applyLocally` writes the expected next state to IDB
 * 2. `request` fires the server call in the background
 * 3. `onSuccess(data)` reconciles IDB with the authoritative response
 * 4. `revert` rolls back IDB if the server rejects
 */
async function optimistic({ applyLocally, request, onSuccess, revert }) {
  await applyLocally();
  emitMutation();
  try {
    const data = await request();
    if (onSuccess) { await onSuccess(data); emitMutation(); }
    return data;
  } catch (err) {
    if (revert) { await revert(); emitMutation(); }
    throw err;
  }
}

/* Atomic read-modify-write on player dust to avoid being clobbered by
 * an in-flight SSE resync. Returns the previous balance for rollback. */
async function adjustDust(delta) {
  const db = await openDb();
  return txn(db, [STORES.PLAYER_STATS], 'readwrite', async (t) => {
    const os = t.objectStore(STORES.PLAYER_STATS);
    const row = (await req(os.get(PLAYER_STATS_KEY))) || { id: PLAYER_STATS_KEY, dust: 0 };
    const prev = row.dust || 0;
    os.put({ ...row, dust: Math.max(0, prev + delta) });
    return prev;
  });
}

async function restoreDust(value) {
  await putRow(STORES.PLAYER_STATS, { id: PLAYER_STATS_KEY, dust: value });
}

/* ── Decks ─────────────────────────────────────────────────────── */

export async function addToDeck(deckId, inventoryId) {
  const db = await openDb();
  const { prevDeckCard, deck, card } = await txn(
    db, [STORES.DECK_CARDS, STORES.DECKS, STORES.CARDS], 'readonly',
    async (t) => ({
      prevDeckCard: await req(t.objectStore(STORES.DECK_CARDS).get(inventoryId)),
      deck:         await req(t.objectStore(STORES.DECKS).get(deckId)),
      card:         await req(t.objectStore(STORES.CARDS).get(inventoryId)),
    }),
  );

  return optimistic({
    applyLocally: () => txn(db, [STORES.DECK_CARDS, STORES.DECKS], 'readwrite', (t) => {
      if (card) t.objectStore(STORES.DECK_CARDS).put({ ...card, deck_id: deckId, inventory_id: inventoryId });
      if (deck) {
        const bumped = prevDeckCard?.deck_id === deckId ? 0 : 1;
        t.objectStore(STORES.DECKS).put({ ...deck, cardCount: (deck.cardCount || 0) + bumped });
      }
    }),
    request: () => mutate({
      method: 'POST',
      path:   `/decks/${deckId}/cards`,
      body:   { inventoryIds: [inventoryId] },
    }),
    revert: () => txn(db, [STORES.DECK_CARDS, STORES.DECKS], 'readwrite', (t) => {
      if (prevDeckCard) t.objectStore(STORES.DECK_CARDS).put(prevDeckCard);
      else              t.objectStore(STORES.DECK_CARDS).delete(inventoryId);
      if (deck) t.objectStore(STORES.DECKS).put(deck);
    }),
  });
}

/** Server assigns the id; no optimistic write possible. */
export async function createDeck(name, inventoryIds = []) {
  const result = await mutate({ method: 'POST', path: '/decks', body: { name, inventoryIds } });
  emitMutation();
  return result;
}

/* ── Market ────────────────────────────────────────────────────── */

async function buy(path, price) {
  let prevDust = 0;
  return optimistic({
    applyLocally: async () => { prevDust = await adjustDust(-price); },
    request:      () => mutate({ method: 'POST', path }),
    revert:       () => restoreDust(prevDust),
  });
}

export const buyQuestDeck = () => buy('/market/buy-deck',   MARKET_PRICES.questDeck);
export const buyTicket    = () => buy('/market/buy-ticket', MARKET_PRICES.memoryTicket);

/* ── Quests ────────────────────────────────────────────────────── */

/** Drop the current card, promote `nextCard`. Recomputes takeCost + canTake. */
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
    exhausted:       !nextCard,
    takeCost:        isFree ? 0 : infusion * 2,
    canTake:         !isFree || !freeTakeUsed,
    freeTakeUsed,
  };
}

function reconcileQuest(deckId) {
  return (state) => state?.exhausted
    ? deleteRow(STORES.QUEST_STATE, deckId)
    : putRow(STORES.QUEST_STATE, state);
}

export async function startQuest() {
  const db = await openDb();
  const row = await txn(db, [STORES.CARDS], 'readonly', async (t) => {
    const all = await req(t.objectStore(STORES.CARDS).getAll());
    return all
      .filter(r => r.card_type === CARD_TYPE.QUEST_DECK)
      .sort((a, b) => (a.acquired_at || '').localeCompare(b.acquired_at || ''))[0];
  });
  if (!row) throw new Error('No quest decks to open');
  const deckId = row.ref_id;
  if (!deckId) throw new Error('Quest deck card missing ref_id');

  const state = await mutate({ method: 'GET', path: `/quest/decks/${deckId}` });
  await putRow(STORES.QUEST_STATE, state);
  emitMutation();
  return deckId;
}

export async function advanceQuest(deckId) {
  const prev = await readRow(STORES.QUEST_STATE, deckId);
  if (!prev) throw new Error('Quest deck not found');

  return optimistic({
    applyLocally: () => putRow(STORES.QUEST_STATE, advancedState(prev)),
    request:      () => mutate({ method: 'POST', path: `/quest/decks/${deckId}/next` }),
    onSuccess:    reconcileQuest(deckId),
    revert:       () => putRow(STORES.QUEST_STATE, prev),
  });
}

export async function takeQuest(deckId) {
  const prev = await readRow(STORES.QUEST_STATE, deckId);
  if (!prev?.currentCard) throw new Error('Quest deck exhausted');
  const cost = prev.takeCost || 0;
  const consumedFreeTake = cost === 0 && !prev.freeTakeUsed;
  const db = await openDb();
  let prevDust = 0;

  return optimistic({
    applyLocally: async () => {
      await txn(db, [STORES.PLAYER_STATS, STORES.QUEST_STATE], 'readwrite', async (t) => {
        const ps = t.objectStore(STORES.PLAYER_STATS);
        const row = (await req(ps.get(PLAYER_STATS_KEY))) || { id: PLAYER_STATS_KEY, dust: 0 };
        prevDust = row.dust || 0;
        ps.put({ ...row, dust: Math.max(0, prevDust - cost) });
        t.objectStore(STORES.QUEST_STATE).put(advancedState(prev, { consumedFreeTake }));
      });
    },
    request:   () => mutate({ method: 'POST', path: `/quest/decks/${deckId}/take` }),
    onSuccess: reconcileQuest(deckId),
    revert:    () => txn(db, [STORES.PLAYER_STATS, STORES.QUEST_STATE], 'readwrite', (t) => {
      t.objectStore(STORES.PLAYER_STATS).put({ id: PLAYER_STATS_KEY, dust: prevDust });
      t.objectStore(STORES.QUEST_STATE).put(prev);
    }),
  });
}

export async function destroyQuest(deckId) {
  const prev = await readRow(STORES.QUEST_STATE, deckId);
  if (!prev?.currentCard) throw new Error('Quest deck exhausted');
  const reward = Math.max(2, (prev.currentCard.infusion || 0) * 2);
  const db = await openDb();
  let prevDust = 0;

  return optimistic({
    applyLocally: async () => {
      await txn(db, [STORES.PLAYER_STATS, STORES.QUEST_STATE], 'readwrite', async (t) => {
        const ps = t.objectStore(STORES.PLAYER_STATS);
        const row = (await req(ps.get(PLAYER_STATS_KEY))) || { id: PLAYER_STATS_KEY, dust: 0 };
        prevDust = row.dust || 0;
        ps.put({ ...row, dust: prevDust + reward });
        t.objectStore(STORES.QUEST_STATE).put(advancedState(prev));
      });
    },
    request:   () => mutate({ method: 'POST', path: `/quest/decks/${deckId}/destroy` }),
    onSuccess: reconcileQuest(deckId),
    revert:    () => txn(db, [STORES.PLAYER_STATS, STORES.QUEST_STATE], 'readwrite', (t) => {
      t.objectStore(STORES.PLAYER_STATS).put({ id: PLAYER_STATS_KEY, dust: prevDust });
      t.objectStore(STORES.QUEST_STATE).put(prev);
    }),
  });
}

/* Free-infuse is not version-bumped server-side, so per-tick writes
 * don't trigger a resync. */
export async function freeInfuseCard(inventoryId, amount = 1) {
  const row = await readRow(STORES.CARDS, inventoryId);
  if (!row?.id) return;
  await putRow(STORES.CARDS, { ...row, infusion: (row.infusion || 0) + amount });
  emitMutation();
  mutate({ method: 'PATCH', path: `/media/${row.id}/free-infuse`, body: { amount } })
    .catch(() => {});
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
  mutate({ method: 'PATCH', path: `/media/${mediaId}/free-infuse`, body: { amount } })
    .catch(() => {});
}
