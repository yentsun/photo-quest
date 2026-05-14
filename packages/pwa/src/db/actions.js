/**
 * @file Optimistic IDB writes; mutations go through the sync queue in
 * `sync.js`. Server truth returns via the queue's `then` refetches or
 * via SSE-triggered resyncs — never synchronously from these actions.
 */

import { CARD_TYPE, MARKET_PRICES, cardCost } from '@photo-quest/shared';
import { openDb, STORES } from './localDb.js';
import { mutate, request, enqueueInTx, markPendingDirty } from './sync.js';
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

/** Shape stored in SEEN_MEDIA — only the fields MarketPage needs to
 *  render and price. */
function seenRow(card) {
  return { id: card.id, type: card.type, title: card.title, infusion: card.infusion || 0 };
}

/** Record media the player has been shown so it can later appear in the
 *  market. Called from quest start/advance/take/destroy and memory start.
 *  Caller must hold a readwrite tx covering SEEN_MEDIA so the write
 *  commits atomically with the surrounding state change. */
function markSeen(t, cards) {
  const list = (Array.isArray(cards) ? cards : [cards]).filter(c => c?.id);
  if (!list.length) return;
  const os = t.objectStore(STORES.SEEN_MEDIA);
  for (const c of list) os.put(seenRow(c));
}

/** Remove media from the market pool — call when the player has made a
 *  final decision about it (sold, destroyed, or destroyed mid-quest), so
 *  the card doesn't pop back into the market after they get rid of it.
 *  Caller must hold a readwrite tx covering SEEN_MEDIA. */
function unmarkSeen(t, mediaId) {
  if (!mediaId) return;
  t.objectStore(STORES.SEEN_MEDIA).delete(mediaId);
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
  let queued = false;
  try {
    await txn(db, [STORES.CARDS, STORES.DECK_CARDS, STORES.DECKS, STORES.PENDING_MUTATIONS], 'readwrite', async (t) => {
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

      enqueueInTx(t, {
        method: 'POST',
        path:   `/decks/${deckId}/cards`,
        body:   { inventoryIds: [inventoryId] },
      });
      queued = true;
    });
    console.debug('[addToDeck] txn committed');
  } catch (err) {
    console.error('[addToDeck] txn FAILED', err);
    throw err;
  }
  emitMutation();
  if (queued) markPendingDirty();
}

export async function createDeck(name, inventoryIds = []) {
  return mutate({ method: 'POST', path: '/decks', body: { name, inventoryIds } });
}

/** Rename a deck. Optimistic IDB write + server PATCH queued atomically. */
export async function renameDeck(deckId, name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return;
  const db = await openDb();
  let queued = false;
  await txn(db, [STORES.DECKS, STORES.PENDING_MUTATIONS], 'readwrite', async (t) => {
    const os = t.objectStore(STORES.DECKS);
    const row = await req(os.get(deckId));
    if (!row) return;
    os.put({ ...row, name: trimmed });
    enqueueInTx(t, { method: 'PATCH', path: `/decks/${deckId}`, body: { name: trimmed } });
    queued = true;
  });
  emitMutation();
  if (queued) markPendingDirty();
}

/**
 * Create a deck and move one or more cards into it. Bypasses the queue
 * so we get the new deck's real positive id back — needed because the
 * next user action references it (opening the deck, dropping more cards
 * on it). Optimistically inserts the deck row, then delegates each card
 * move to addToDeck so deck-count bookkeeping and the move-from-prior-deck
 * flow stay in one place. `parentId` is the id of an enclosing deck when
 * spawning a child deck from inside DeckPage; null/omitted for top-level.
 */
export async function createDeckWithCards(name, inventoryIds = [], parentId = null) {
  const result = await request({
    method: 'POST',
    path:   '/decks',
    body:   { name, parentId },
  });
  if (!result?.id) throw new Error('createDeck: no id returned');
  const db = await openDb();
  await txn(db, [STORES.DECKS], 'readwrite', (t) => {
    t.objectStore(STORES.DECKS).put({
      id:        result.id,
      name:      result.name,
      parent_id: result.parent_id ?? null,
      cardCount: 0,
    });
  });
  emitMutation();
  for (const id of inventoryIds) {
    if (id) await addToDeck(result.id, id);
  }
  return result;
}

/* ── Market ────────────────────────────────────────────────────── */

/**
 * Optimistic inventory insert for market buys + atomic POST queue. Uses
 * a negative temp inventory_id so it never collides with server-assigned
 * positive ids. `_pending: true` signals UI that the row is awaiting
 * server-side construction (quest decks need cards sampled); `ref_id:
 * null` is the cue startQuest uses to refuse to open the deck yet.
 *
 * Optimistic write + queue commit in a single tx so a sync racing in
 * between can't prune the optimistic row before the POST is queued.
 */
async function optimisticBuy(card, mutation) {
  const db = await openDb();
  await txn(db, [STORES.CARDS, STORES.PENDING_MUTATIONS], 'readwrite', (t) => {
    t.objectStore(STORES.CARDS).put(card);
    enqueueInTx(t, mutation);
  });
}

export async function buyQuestDeck() {
  await adjustDust(-MARKET_PRICES.questDeck);
  await optimisticBuy({
    inventory_id: -Date.now(),
    card_type:    CARD_TYPE.QUEST_DECK,
    ref_id:       null,
    acquired_at:  new Date().toISOString(),
    _pending:     true,
  }, { method: 'POST', path: '/market/buy-deck' });
  emitMutation();
  /* Player is waiting on this to become playable — bypass the tick.
   * The optimistic row is pruned by the post-drain sync in the same
   * atomic tx that puts the real server row (see syncPaged). */
  markPendingDirty({ flush: true });
}

export async function buyTicket() {
  await adjustDust(-MARKET_PRICES.memoryTicket);
  await optimisticBuy({
    inventory_id: -Date.now(),
    card_type:    CARD_TYPE.MEMORY_TICKET,
    ref_id:       null,
    acquired_at:  new Date().toISOString(),
    _pending:     true,
  }, { method: 'POST', path: '/market/buy-ticket' });
  emitMutation();
  markPendingDirty({ flush: true });
}

/**
 * Buy an individual media card from the market (cards previously exposed
 * via quest decks / memory games but not yet owned). Cost mirrors the
 * server: `max(2, infusion * 2)`.
 *
 * Bypasses the queue and waits for the server response so the new
 * inventory row lands locally with its REAL positive inventory_id.
 * The optimistic-negative-id pattern doesn't work here because the
 * very next user action (drag to deck) sends the inventory_id to the
 * server — a negative id means the server silently no-ops the addToDeck
 * (FK miss on `INSERT OR IGNORE`) and the card falls out of the deck on
 * the next sync. Requires network: rejects with status 0 if offline.
 */
export async function buyMarketCard(card) {
  if (!card?.id) throw new Error('Bad card');
  const cost = cardCost(card.infusion);
  await adjustDust(-cost);
  emitMutation();
  let response;
  try {
    response = await request({ method: 'POST', path: `/market/cards/${card.id}` });
  } catch (err) {
    await adjustDust(cost);
    emitMutation();
    throw err;
  }
  if (response?.item) {
    const db = await openDb();
    await txn(db, [STORES.CARDS], 'readwrite', (t) => {
      t.objectStore(STORES.CARDS).put({
        ...response.item,
        card_type: CARD_TYPE.MEDIA,
        ref_id:    null,
      });
    });
    emitMutation();
  }
  return response;
}

/* ── Quests ────────────────────────────────────────────────────── */

/** Read the full deck array from the inventory row so local advances can
 *  promote the upcoming card without waiting on a server refetch. The
 *  array is a snapshot from the last sync; positions stay stable for
 *  skip/take, and destroy advances past the same media slot the server
 *  reaches via its position-shift, so cards[N] is correct in either op. */
async function readQuestDeckCards(deckId) {
  const db = await openDb();
  return txn(db, [STORES.CARDS], 'readonly', async (t) => {
    const all = await req(t.objectStore(STORES.CARDS).getAll());
    const row = all.find(r =>
      r.card_type === CARD_TYPE.QUEST_DECK && r.ref_id === deckId
    );
    return row?.quest_cards || null;
  });
}

/** Drop the current card, promote the upcoming one. Recomputes takeCost +
 *  canTake. With `cards` in hand we can keep promoting offline AND
 *  confirm exhaustion locally (the array is the deck's authoritative
 *  contents from the last sync). Without `cards` we fall back to the
 *  old shape — preserving the prior behaviour that defers exhaustion
 *  to the server (LAW 1.38). */
function advancedState(state, cards, { consumedFreeTake = false } = {}) {
  const nextPosition = state.currentPosition + 1;
  const haveCards = Array.isArray(cards);
  const currentCard = haveCards
    ? (nextPosition < cards.length ? cards[nextPosition] : null)
    : (state.nextCard || null);
  const nextCard = haveCards && nextPosition + 1 < cards.length
    ? cards[nextPosition + 1]
    : null;
  const exhausted = haveCards
    ? nextPosition >= cards.length
    : !!state.exhausted;
  const freeTakeUsed = state.freeTakeUsed || consumedFreeTake;
  const infusion = currentCard?.infusion || 0;
  const isFree   = infusion === 0;
  return {
    ...state,
    currentPosition: nextPosition,
    currentCard,
    nextCard,
    exhausted,
    takeCost:        isFree ? 0 : infusion * 2,
    canTake:         !isFree || !freeTakeUsed,
    freeTakeUsed,
  };
}

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

/**
 * Open the oldest ready quest deck. Fully local (LAW 1.39) — quest decks
 * form server-side at purchase and the formed cards ship with the
 * inventory row (see listInventory's `quest_cards` attach), so no
 * network call is needed. If a QUEST_STATE row already exists for this
 * deck (player resumed mid-deck) we keep it; otherwise we seed from the
 * inventory row's `quest_cards` + `current_position` + `free_take_used`.
 */
export async function startQuest() {
  const db = await openDb();
  const row = await txn(db, [STORES.CARDS], 'readonly', async (t) => {
    const all = await req(t.objectStore(STORES.CARDS).getAll());
    return all
      .filter(r =>
        r.card_type === CARD_TYPE.QUEST_DECK &&
        !r._pending &&
        r.ref_id &&
        Array.isArray(r.quest_cards) &&
        r.quest_cards.length > 0,
      )
      .sort((a, b) => (a.acquired_at || '').localeCompare(b.acquired_at || ''))[0];
  });
  if (!row) throw new Error('No quest decks to open');
  const deckId = row.ref_id;

  const existing = await readRow(STORES.QUEST_STATE, deckId);
  /* Re-seed when we have a row but `currentCard` is null while a card
   * still sits at `currentPosition` in the deck array. This recovers
   * sessions left in the old broken offline state (advance set
   * nextCard=null, second advance promoted null into currentCard). */
  const isStale = existing
    && !existing.exhausted
    && !existing.currentCard
    && existing.currentPosition < row.quest_cards.length;
  if (!existing || isStale) {
    const cards = row.quest_cards;
    const total = cards.length;
    const position = Math.min(existing?.currentPosition ?? row.current_position ?? 0, total);
    const currentCard  = position < total ? cards[position] : null;
    const nextCard     = position + 1 < total ? cards[position + 1] : null;
    const infusion     = currentCard?.infusion || 0;
    const isFree       = infusion === 0;
    const freeTakeUsed = existing?.freeTakeUsed ?? !!row.free_take_used;
    await txn(db, [STORES.QUEST_STATE, STORES.SEEN_MEDIA], 'readwrite', async (t) => {
      t.objectStore(STORES.QUEST_STATE).put({
        id:              deckId,
        deckIndex:       row.deck_index,
        currentPosition: position,
        totalCards:      total,
        exhausted:       position >= total,
        currentCard,
        nextCard,
        takeCost:        isFree ? 0 : infusion * 2,
        canTake:         !isFree || !freeTakeUsed,
        freeTakeUsed,
      });
      if (currentCard) markSeen(t, currentCard);
    });
    emitMutation();
  }
  return deckId;
}

/* Quest actions are FULLY local — the deck's quest_cards array is the
 * authoritative card list (loaded once with the inventory row), so we
 * compute next/take/destroy state without a server refetch. The POST
 * is fire-and-forget; the server reconciles via its own change stream
 * and the periodic syncInventory will catch any divergence on its own
 * terms — without a refetch racing the user's clicks. */
export async function advanceQuest(deckId) {
  const prev = await readRow(STORES.QUEST_STATE, deckId);
  if (!prev) throw new Error('Quest deck not found');
  const cards = await readQuestDeckCards(deckId);
  const next = advancedState(prev, cards);
  const db = await openDb();
  await txn(db, [STORES.QUEST_STATE, STORES.SEEN_MEDIA, STORES.PENDING_MUTATIONS], 'readwrite', async (t) => {
    t.objectStore(STORES.QUEST_STATE).put(next);
    if (next.currentCard) markSeen(t, next.currentCard);
    enqueueInTx(t, { method: 'POST', path: `/quest/decks/${deckId}/next` });
  });
  emitMutation();
  markPendingDirty();
}

export async function takeQuest(deckId) {
  const prev = await readRow(STORES.QUEST_STATE, deckId);
  if (!prev?.currentCard) throw new Error('Quest deck exhausted');
  /* Derive from live infusion, not cached takeCost — passive infusion
   * may have bumped the card since the last server refetch. */
  const infusion = prev.currentCard.infusion || 0;
  const cost = infusion === 0 ? 0 : infusion * 2;
  const consumedFreeTake = cost === 0 && !prev.freeTakeUsed;
  const cards = await readQuestDeckCards(deckId);
  const taken = prev.currentCard;
  /* Optimistic inventory row for the taken card. Without this the card
   * only appears whenever the SSE-triggered syncInventory eventually
   * runs — which can be long after the player has moved on, making the
   * card seem to "appear from nowhere". Negative inventory_id can't
   * collide with server ids; syncPaged prunes it atomically when the
   * real positive-id row arrives. */
  const optimistic = {
    inventory_id: -Date.now(),
    card_type:    CARD_TYPE.MEDIA,
    ref_id:       null,
    acquired_at:  new Date().toISOString(),
    id:           taken.id,
    type:         taken.type,
    title:        taken.title,
    infusion:     taken.infusion || 0,
  };
  const next = advancedState(prev, cards, { consumedFreeTake });
  const db = await openDb();
  await txn(db, [STORES.PLAYER_STATS, STORES.QUEST_STATE, STORES.CARDS, STORES.SEEN_MEDIA, STORES.PENDING_MUTATIONS], 'readwrite', async (t) => {
    const ps  = t.objectStore(STORES.PLAYER_STATS);
    const row = (await req(ps.get(PLAYER_STATS_KEY))) || { id: PLAYER_STATS_KEY, dust: 0 };
    ps.put({ ...row, dust: Math.max(0, (row.dust || 0) - cost) });
    t.objectStore(STORES.QUEST_STATE).put(next);
    t.objectStore(STORES.CARDS).put(optimistic);
    if (next.currentCard) markSeen(t, next.currentCard);
    enqueueInTx(t, { method: 'POST', path: `/quest/decks/${deckId}/take` });
  });
  emitMutation();
  markPendingDirty();
}

/** Destroy mirrors the server's model: the destroyed card is removed
 *  from the deck array AND `currentPosition` stays put — the card that
 *  was at N+1 is now at N. Using `advancedState` here would increment
 *  the position locally while the server keeps it (LAW 1.38). */
function destroyedState(state, newCards) {
  const position = state.currentPosition;
  const total = newCards.length;
  const exhausted = position >= total;
  const currentCard = position < total ? newCards[position] : null;
  const nextCard    = position + 1 < total ? newCards[position + 1] : null;
  const infusion = currentCard?.infusion || 0;
  const isFree   = infusion === 0;
  return {
    ...state,
    currentPosition: position,
    totalCards:      total,
    exhausted,
    currentCard,
    nextCard,
    takeCost:        isFree ? 0 : infusion * 2,
    canTake:         !isFree || !state.freeTakeUsed,
  };
}

export async function destroyQuest(deckId) {
  const prev = await readRow(STORES.QUEST_STATE, deckId);
  if (!prev?.currentCard) throw new Error('Quest deck exhausted');
  const reward = cardCost(prev.currentCard.infusion);
  const destroyedMediaId = prev.currentCard.id;
  const db = await openDb();
  await txn(db, [STORES.PLAYER_STATS, STORES.QUEST_STATE, STORES.CARDS, STORES.SEEN_MEDIA, STORES.PENDING_MUTATIONS], 'readwrite', async (t) => {
    const ps  = t.objectStore(STORES.PLAYER_STATS);
    const row = (await req(ps.get(PLAYER_STATS_KEY))) || { id: PLAYER_STATS_KEY, dust: 0 };
    ps.put({ ...row, dust: (row.dust || 0) + reward });

    /* Mirror the server's `DELETE FROM quest_cards` + position reindex
     * by rewriting the inventory row's deck array. Keeps cards.length
     * authoritative for the next destroy and for advance/exhaustion
     * checks until syncInventory catches up. */
    const cardsOS = t.objectStore(STORES.CARDS);
    const all = await req(cardsOS.getAll());
    const invRow = all.find(r =>
      r.card_type === CARD_TYPE.QUEST_DECK && r.ref_id === deckId
    );
    let newCards = Array.isArray(invRow?.quest_cards) ? invRow.quest_cards : [];
    /* Remove only the first match — defensive against a duplicate id
     * sneaking in; the server's delete-by-row-id is unambiguous. */
    const idx = newCards.findIndex(c => c.id === destroyedMediaId);
    if (idx >= 0) newCards = [...newCards.slice(0, idx), ...newCards.slice(idx + 1)];
    if (invRow) {
      cardsOS.put({
        ...invRow,
        quest_cards: newCards,
        total_cards: newCards.length,
      });
    }

    const next = destroyedState(prev, newCards);
    t.objectStore(STORES.QUEST_STATE).put(next);
    unmarkSeen(t, destroyedMediaId);
    if (next.currentCard) markSeen(t, next.currentCard);

    enqueueInTx(t, { method: 'POST', path: `/quest/decks/${deckId}/destroy` });
  });
  emitMutation();
  markPendingDirty();
}

/** Sell a card back to the library. Reward = infusion (LAW 4.15). */
export async function sellCard(inventoryId) {
  const db = await openDb();
  const queued = await txn(db, [STORES.CARDS, STORES.DECK_CARDS, STORES.PLAYER_STATS, STORES.SEEN_MEDIA, STORES.PENDING_MUTATIONS], 'readwrite', async (t) => {
    const cards = t.objectStore(STORES.CARDS);
    const row = await req(cards.get(inventoryId));
    if (!row) return false;
    const reward = row.infusion || 0;
    cards.delete(inventoryId);
    t.objectStore(STORES.DECK_CARDS).delete(inventoryId);
    const ps  = t.objectStore(STORES.PLAYER_STATS);
    const pl  = (await req(ps.get(PLAYER_STATS_KEY))) || { id: PLAYER_STATS_KEY, dust: 0 };
    ps.put({ ...pl, dust: (pl.dust || 0) + reward });
    unmarkSeen(t, row.id);
    enqueueInTx(t, { method: 'POST', path: `/inventory/${inventoryId}/sell` });
    return true;
  });
  if (!queued) return;
  emitMutation();
  markPendingDirty();
}

/** Destroy a card: remove from inventory + delete file from disk. Reward = max(2, infusion*2) (LAW 4.10). */
export async function destroyCard(inventoryId) {
  const db = await openDb();
  const queued = await txn(db, [STORES.CARDS, STORES.DECK_CARDS, STORES.PLAYER_STATS, STORES.SEEN_MEDIA, STORES.PENDING_MUTATIONS], 'readwrite', async (t) => {
    const cards = t.objectStore(STORES.CARDS);
    const row = await req(cards.get(inventoryId));
    if (!row) return false;
    const reward = cardCost(row.infusion);
    cards.delete(inventoryId);
    t.objectStore(STORES.DECK_CARDS).delete(inventoryId);
    const ps = t.objectStore(STORES.PLAYER_STATS);
    const pl = (await req(ps.get(PLAYER_STATS_KEY))) || { id: PLAYER_STATS_KEY, dust: 0 };
    ps.put({ ...pl, dust: (pl.dust || 0) + reward });
    unmarkSeen(t, row.id);
    enqueueInTx(t, { method: 'DELETE', path: `/inventory/${inventoryId}/destroy` });
    return true;
  });
  if (!queued) return;
  emitMutation();
  markPendingDirty();
}

/* ── Memory game ───────────────────────────────────────────────── */

const PAIR_COUNT = 8;

function buildMemoryDeck(gameCards) {
  const cards = [];
  for (const m of gameCards) {
    cards.push({ id: `${m.id}-a`, mediaId: m.id, pairKey: m.id, type: m.type, title: m.title });
    cards.push({ id: `${m.id}-b`, mediaId: m.id, pairKey: m.id, type: m.type, title: m.title });
  }
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

/**
 * Start a memory game from a ready (server-formed) ticket. The deck was
 * sampled at purchase time and shipped with the ticket's inventory row
 * as `game_cards`, so this is fully local — no network call needed
 * (LAW 1.39). The ticket is optimistically deleted and the server is
 * told to consume it via the queue.
 */
export async function startMemory() {
  const db = await openDb();
  const ticket = await txn(db, [STORES.CARDS], 'readonly', async (t) => {
    const all = await req(t.objectStore(STORES.CARDS).getAll());
    return all
      .filter(r =>
        r.card_type === CARD_TYPE.MEMORY_TICKET &&
        !r._pending &&
        Array.isArray(r.game_cards) &&
        r.game_cards.length >= PAIR_COUNT
      )
      .sort((a, b) => (a.acquired_at || '').localeCompare(b.acquired_at || ''))[0];
  });
  if (!ticket) throw new Error('No ready memory tickets to play');

  const gameCards = ticket.game_cards.slice(0, PAIR_COUNT);
  const deck = buildMemoryDeck(gameCards);

  await txn(db, [STORES.CARDS, STORES.MEMORY_STATE, STORES.SEEN_MEDIA, STORES.PENDING_MUTATIONS], 'readwrite', async (t) => {
    t.objectStore(STORES.CARDS).delete(ticket.inventory_id);
    t.objectStore(STORES.MEMORY_STATE).put({
      id:        1,
      phase:     'play',
      cards:     deck,
      pairCount: PAIR_COUNT,
      matched:   [],
      moves:     0,
      startedAt: Date.now(),
    });
    markSeen(t, gameCards);
    /* Tell the server the ticket is spent. Queued so play stays online-agnostic. */
    enqueueInTx(t, {
      method: 'POST',
      path:   '/market/use-ticket',
      body:   ticket.inventory_id > 0 ? { inventoryId: ticket.inventory_id } : {},
    });
  });
  emitMutation();
  markPendingDirty();

  return 1;
}

/** Persist a local-only update of the memory game state. */
export async function patchMemoryState(patch) {
  const prev = await readRow(STORES.MEMORY_STATE, 1);
  if (!prev) return;
  await putRow(STORES.MEMORY_STATE, { ...prev, ...patch });
  emitMutation();
}

/** Clear the active memory game (called on leave / after rewards claimed). */
export async function endMemory() {
  const db = await openDb();
  await txn(db, [STORES.MEMORY_STATE], 'readwrite', (t) => {
    t.objectStore(STORES.MEMORY_STATE).delete(1);
  });
  emitMutation();
}

/**
 * Claim a matched card as a reward. Optimistic inventory insert (server
 * echoes the real inventory_id on the next sync-all). +10 dust infusion
 * bonus per LAW 4.17.
 */
export async function claimMemoryPick(mediaId, card) {
  const db = await openDb();
  let queued = false;
  await txn(db, [STORES.CARDS, STORES.PENDING_MUTATIONS], 'readwrite', async (t) => {
    const cards = t.objectStore(STORES.CARDS);
    const all = await req(cards.getAll());
    if (all.some(r => r.id === mediaId && r.card_type === CARD_TYPE.MEDIA)) return;
    cards.put({
      inventory_id: -Date.now() - Math.floor(Math.random() * 1000),
      card_type:    CARD_TYPE.MEDIA,
      id:           mediaId,
      type:         card.type,
      title:        card.title,
      infusion:     (card.infusion || 0) + 10,
      acquired_at:  new Date().toISOString(),
      _pending:     true,
    });
    enqueueInTx(t, {
      method: 'POST',
      path:   '/inventory',
      body:   { mediaId, infuseBonus: 10 },
    });
    queued = true;
  });
  if (!queued) return;
  emitMutation();
  markPendingDirty({ flush: true });
}

export async function renameCard(inventoryId, title) {
  const clean = (title || '').trim();
  if (!clean) return;
  const db = await openDb();
  const queued = await txn(db, [STORES.CARDS, STORES.DECK_CARDS, STORES.PENDING_MUTATIONS], 'readwrite', async (t) => {
    const cards = t.objectStore(STORES.CARDS);
    const row = await req(cards.get(inventoryId));
    if (!row?.id) return false;
    if (row.title === clean) return false;
    cards.put({ ...row, title: clean });

    const deckRow = await req(t.objectStore(STORES.DECK_CARDS).get(inventoryId));
    if (deckRow) t.objectStore(STORES.DECK_CARDS).put({ ...deckRow, title: clean });

    enqueueInTx(t, { method: 'PATCH', path: `/media/${row.id}/rename`, body: { title: clean } });
    return true;
  });
  if (!queued) return;
  emitMutation();
  markPendingDirty();
}

/* Free-infuse fires very often (5 s ticks); don't version-bump server
 * side, so per-tick writes don't trigger resyncs. */
export async function freeInfuseCard(inventoryId, amount = 1) {
  const db = await openDb();
  const queued = await txn(db, [STORES.CARDS, STORES.DECK_CARDS, STORES.PENDING_MUTATIONS], 'readwrite', async (t) => {
    const cards = t.objectStore(STORES.CARDS);
    const row = await req(cards.get(inventoryId));
    if (!row?.id) return false;
    cards.put({ ...row, infusion: (row.infusion || 0) + amount });

    const deckRow = await req(t.objectStore(STORES.DECK_CARDS).get(inventoryId));
    if (deckRow) {
      t.objectStore(STORES.DECK_CARDS).put({ ...deckRow, infusion: (deckRow.infusion || 0) + amount });
    }

    enqueueInTx(t, { method: 'PATCH', path: `/media/${row.id}/free-infuse`, body: { amount } });
    return true;
  });
  if (!queued) return;
  emitMutation();
  markPendingDirty();
}

export async function freeInfuseQuest(deckId, mediaId, amount = 1) {
  const db = await openDb();
  let queued = false;
  await txn(db, [STORES.QUEST_STATE, STORES.PENDING_MUTATIONS], 'readwrite', async (t) => {
    const os = t.objectStore(STORES.QUEST_STATE);
    const state = await req(os.get(deckId));
    if (state?.currentCard?.id !== mediaId) return;
    os.put({
      ...state,
      currentCard: { ...state.currentCard, infusion: (state.currentCard.infusion || 0) + amount },
    });
    enqueueInTx(t, { method: 'PATCH', path: `/media/${mediaId}/free-infuse`, body: { amount } });
    queued = true;
  });
  if (queued) {
    emitMutation();
    markPendingDirty();
  }
}

/** Trigger a server-side rescan of a folder. The server bumps the
 *  `media` channel when the scan advances, which re-pulls folders
 *  via the SSE-driven resync. Nothing to do locally. */
export async function refreshFolder(path) {
  return mutate({ method: 'POST', path: '/media/scan', body: { path }, flush: true });
}
