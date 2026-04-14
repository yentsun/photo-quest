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

export async function addToDeck(deckId, inventoryId) {
  const db = await openDb();
  await txn(db, [STORES.CARDS, STORES.DECK_CARDS, STORES.DECKS], 'readwrite', async (t) => {
    const card = await req(t.objectStore(STORES.CARDS).get(inventoryId));
    if (!card) return;
    const prev = await req(t.objectStore(STORES.DECK_CARDS).get(inventoryId));
    if (prev?.deck_id === deckId) return;
    t.objectStore(STORES.DECK_CARDS).put({ ...card, deck_id: deckId, inventory_id: inventoryId });
    const deck = await req(t.objectStore(STORES.DECKS).get(deckId));
    if (deck) t.objectStore(STORES.DECKS).put({ ...deck, cardCount: (deck.cardCount || 0) + 1 });
  });
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

async function buy(path, price) {
  await adjustDust(-price);
  emitMutation();
  return mutate({ method: 'POST', path });
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

const questRefetch = (deckId) => ({
  method: 'GET',
  path:   `/quest/decks/${deckId}`,
  store:  STORES.QUEST_STATE,
});

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
