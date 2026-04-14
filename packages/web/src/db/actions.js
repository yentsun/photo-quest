/**
 * @file Optimistic mutation API for the local IndexedDB replica.
 *
 * Pattern: each action runs a single multi-store `tx` that applies the
 * optimistic update across the affected stores AND enqueues a row in
 * `mutation_queue`. After the txn commits the drain loop is kicked
 * (fire-and-forget); see `sync.js#drainMutationQueue` for push +
 * reconciliation.
 *
 * Server-wins reconciliation: when the queue drains, the affected tables
 * are re-pulled so any divergence between optimistic local state and the
 * server's authoritative response is corrected.
 *
 * For mutations the client can't predict (e.g. createDeck — server
 * assigns the new id), the local update is partial: dust deltas and
 * grouping flips happen immediately, but the new deck row appears only
 * after reconcile.
 */

import { CARD_TYPE, MARKET_PRICES } from '@photo-quest/shared';
import { tx, req, getByKey, STORES } from './localDb.js';
import { drainMutationQueue } from './sync.js';

/* Internal helper — enqueue a mutation row for the drain loop. */
function enqueue(t, type, payload) {
  t.objectStore(STORES.MUTATION_QUEUE).add({
    type,
    payload,
    createdAt: Date.now(),
    attempts: 0,
  });
}

/* Read all rows from a store using an index, from inside an active txn. */
function getAllFromIndex(t, storeName, indexName, value) {
  return req(t.objectStore(storeName).index(indexName).getAll(value));
}

/* Delete every deck_cards row matching an indexed value. Used by both
 * inventory-side cascades (inventory sold/destroyed → drop from any deck)
 * and deck-side cascades (deck deleted → drop all its rows). Caller must
 * have STORES.DECK_CARDS in the active txn. */
async function deleteDeckCardsBy(t, indexName, value) {
  const rows = await getAllFromIndex(t, STORES.DECK_CARDS, indexName, value);
  for (const r of rows) {
    t.objectStore(STORES.DECK_CARDS).delete([r.deck_id, r.inventory_id]);
  }
}

/* Shared body for sellCard and destroyCard. */
async function removeInventoryRow(t, invId, type, rewardFn) {
  const inv = await req(t.objectStore(STORES.INVENTORY).get(invId));
  if (!inv) throw new Error('Inventory item not found');
  const stats = await req(t.objectStore(STORES.PLAYER_STATS).get(1));
  const reward = rewardFn(inv.infusion || 0);
  t.objectStore(STORES.INVENTORY).delete(invId);
  t.objectStore(STORES.PLAYER_STATS).put({ id: 1, dust: (stats?.dust || 0) + reward });
  await deleteDeckCardsBy(t, 'inventory_id', invId);
  enqueue(t, type, { invId });
}

/* ── Inventory ─────────────────────────────────────────────────── */

const RW_REMOVE_STORES = [STORES.INVENTORY, STORES.PLAYER_STATS, STORES.DECK_CARDS, STORES.MUTATION_QUEUE];

/** Sell a card back to the library. LAW 4.15: reward = infusion. */
export async function sellCard(invId) {
  await tx(RW_REMOVE_STORES, 'readwrite',
    (t) => removeInventoryRow(t, invId, 'inventory.sell', infusion => infusion));
  drainMutationQueue();
}

/** Destroy a card. LAW 4.10: reward = max(2, infusion * 2); media file deleted server-side. */
export async function destroyCard(invId) {
  await tx(RW_REMOVE_STORES, 'readwrite',
    (t) => removeInventoryRow(t, invId, 'inventory.destroy', infusion => Math.max(2, infusion * 2)));
  drainMutationQueue();
}

/* ── Decks ─────────────────────────────────────────────────────── */

/**
 * Move inventory cards into a deck. A card belongs to at most one deck,
 * so any prior membership is dropped first (mirrors addToDeck.js).
 * LAW 4.18: +10 infusion is applied once per (card, deck), enforced
 * locally by checking the compound PK before the bump.
 */
export async function addToDeck(deckId, inventoryIds) {
  await tx(
    [STORES.INVENTORY, STORES.DECK_CARDS, STORES.META, STORES.MUTATION_QUEUE],
    'readwrite',
    async (t) => {
      const invStore = t.objectStore(STORES.INVENTORY);
      const dcStore  = t.objectStore(STORES.DECK_CARDS);
      const metaStore = t.objectStore(STORES.META);

      const groupedRow = (await req(metaStore.get('groupedIds'))) || { key: 'groupedIds', value: [] };
      const groupedSet = new Set(groupedRow.value);
      for (const invId of inventoryIds) {
        const [inv, alreadyHere] = await Promise.all([
          req(invStore.get(invId)),
          req(dcStore.get([deckId, invId])),
        ]);
        if (!inv) continue;

        const memberships = await getAllFromIndex(t, STORES.DECK_CARDS, 'inventory_id', invId);
        for (const m of memberships) {
          if (m.deck_id !== deckId) dcStore.delete([m.deck_id, m.inventory_id]);
        }

        const newInfusion = alreadyHere ? (inv.infusion || 0) : (inv.infusion || 0) + 10;
        const updatedInv = { ...inv, infusion: newInfusion };
        invStore.put(updatedInv);
        dcStore.put({
          deck_id: deckId,
          inventory_id: invId,
          acquired_at: inv.acquired_at,
          ...updatedInv,
        });
        groupedSet.add(invId);
      }
      metaStore.put({ key: 'groupedIds', value: [...groupedSet] });
      enqueue(t, 'deck.add', { deckId, inventoryIds });
    },
  );
  drainMutationQueue();
}

/**
 * Create a new deck containing the given cards. The local replica can't
 * predict the new deck id, so we only flip groupedIds + apply the LAW 4.18
 * +10 bonus optimistically; the new deck row appears after reconcile.
 */
export async function createDeck(name, inventoryIds) {
  await tx(
    [STORES.INVENTORY, STORES.META, STORES.MUTATION_QUEUE],
    'readwrite',
    async (t) => {
      const invStore = t.objectStore(STORES.INVENTORY);
      const metaStore = t.objectStore(STORES.META);

      const groupedRow = (await req(metaStore.get('groupedIds'))) || { key: 'groupedIds', value: [] };
      const groupedSet = new Set(groupedRow.value);
      for (const invId of inventoryIds) {
        const inv = await req(invStore.get(invId));
        if (!inv) continue;
        invStore.put({ ...inv, infusion: (inv.infusion || 0) + 10 });
        groupedSet.add(invId);
      }
      metaStore.put({ key: 'groupedIds', value: [...groupedSet] });
      enqueue(t, 'deck.create', { name, inventoryIds });
    },
  );
  drainMutationQueue();
}

export async function renameDeck(deckId, name) {
  await tx(
    [STORES.DECKS, STORES.MUTATION_QUEUE],
    'readwrite',
    async (t) => {
      const deck = await req(t.objectStore(STORES.DECKS).get(deckId));
      if (deck) t.objectStore(STORES.DECKS).put({ ...deck, name });
      enqueue(t, 'deck.rename', { deckId, name });
    },
  );
  drainMutationQueue();
}

/** Delete a deck. Member cards stay in inventory but lose their grouping. */
export async function deleteDeck(deckId) {
  await tx(
    [STORES.DECKS, STORES.DECK_CARDS, STORES.MUTATION_QUEUE],
    'readwrite',
    async (t) => {
      t.objectStore(STORES.DECKS).delete(deckId);
      await deleteDeckCardsBy(t, 'deck_id', deckId);
      enqueue(t, 'deck.delete', { deckId });
    },
  );
  drainMutationQueue();
}

/* ── Quest ─────────────────────────────────────────────────────── */

/* Find next quest_card in `cards` (sorted by position) at or after `fromPos`
 * whose media isn't in `ownedMediaIds`. Mirrors getQuestDeck.findNextUnownedCard. */
function findNextUnowned(cards, fromPos, ownedMediaIds) {
  for (const c of cards) {
    if (c.position >= fromPos && !ownedMediaIds.has(c.media_id)) return c;
  }
  return null;
}

/**
 * Advance the quest deck to the next unowned card. Persists the new
 * `current_position` (skipping owned cards) and, if the player has run out,
 * marks the deck `exhausted` and removes its quest_deck inventory row.
 */
export async function advanceQuest(deckId) {
  await tx(
    [STORES.QUEST_DECKS, STORES.QUEST_CARDS, STORES.INVENTORY, STORES.MUTATION_QUEUE],
    'readwrite',
    async (t) => {
      const deck = await req(t.objectStore(STORES.QUEST_DECKS).get(deckId));
      if (!deck || deck.exhausted) return;
      const cards = (await getAllFromIndex(t, STORES.QUEST_CARDS, 'deck_id', deckId))
        .sort((a, b) => a.position - b.position);
      const inventory = await req(t.objectStore(STORES.INVENTORY).getAll());
      const ownedMediaIds = new Set(inventory.filter(i => i.media_id != null).map(i => i.media_id));

      const next = findNextUnowned(cards, deck.current_position + 1, ownedMediaIds);
      const newPos = next ? next.position : deck.total_cards;
      const exhausted = newPos >= deck.total_cards;
      t.objectStore(STORES.QUEST_DECKS).put({
        ...deck,
        current_position: newPos,
        exhausted: exhausted ? 1 : 0,
      });
      if (exhausted) deleteQuestDeckInventory(t, inventory, deckId);
      enqueue(t, 'quest.advance', { deckId });
    },
  );
  drainMutationQueue();
}

/**
 * Take the current quest card. LAW 4.9: free if infusion === 0 and
 * !free_take_used, otherwise costs `infusion * 2`. Adds the card's media to
 * inventory, deducts dust, sets free_take_used if used, then advances.
 */
export async function takeQuest(deckId) {
  await tx(
    [STORES.QUEST_DECKS, STORES.QUEST_CARDS, STORES.INVENTORY, STORES.PLAYER_STATS, STORES.MUTATION_QUEUE],
    'readwrite',
    async (t) => {
      const deck = await req(t.objectStore(STORES.QUEST_DECKS).get(deckId));
      if (!deck || deck.exhausted) return;
      const cards = (await getAllFromIndex(t, STORES.QUEST_CARDS, 'deck_id', deckId))
        .sort((a, b) => a.position - b.position);
      const inventory = await req(t.objectStore(STORES.INVENTORY).getAll());
      const ownedMediaIds = new Set(inventory.filter(i => i.media_id != null).map(i => i.media_id));

      const card = findNextUnowned(cards, deck.current_position, ownedMediaIds);
      if (!card) return;
      const infusion = card.infusion || 0;
      const freeTakeUsed = !!deck.free_take_used;
      if (infusion === 0 && freeTakeUsed) throw new Error('Free take already used for this deck');
      const cost = infusion * 2;

      const stats = await req(t.objectStore(STORES.PLAYER_STATS).get(1));
      const dust = stats?.dust || 0;
      if (cost > dust) throw new Error('Insufficient magic dust');

      if (cost > 0) t.objectStore(STORES.PLAYER_STATS).put({ id: 1, dust: dust - cost });

      /* Optimistic inventory insert. The real inventory_id comes from the
       * server; we use a negative temp id so it can't collide with real
       * server-assigned ids. The post-push reconcile will replace the
       * whole inventory store anyway. */
      const tempInvId = -Date.now();
      t.objectStore(STORES.INVENTORY).put({
        inventory_id: tempInvId,
        media_id: card.media_id,
        card_type: CARD_TYPE.MEDIA,
        ref_id: null,
        acquired_at: new Date().toISOString(),
        ...card,
        id: card.media_id,
      });

      const newDeck = { ...deck };
      if (infusion === 0) newDeck.free_take_used = 1;

      /* Find next unowned starting after the just-taken card. */
      const newOwned = new Set(ownedMediaIds).add(card.media_id);
      const next = findNextUnowned(cards, card.position + 1, newOwned);
      newDeck.current_position = next ? next.position : deck.total_cards;
      newDeck.exhausted = newDeck.current_position >= deck.total_cards ? 1 : 0;
      t.objectStore(STORES.QUEST_DECKS).put(newDeck);
      if (newDeck.exhausted) {
        const refreshed = await req(t.objectStore(STORES.INVENTORY).getAll());
        deleteQuestDeckInventory(t, refreshed, deckId);
      }

      enqueue(t, 'quest.take', { deckId });
    },
  );
  drainMutationQueue();
}

/**
 * Destroy the current quest card: award dust (LAW 4.16: max(2, infusion*2)),
 * remove the card row, hide the underlying media locally, advance.
 */
export async function destroyQuest(deckId) {
  await tx(
    [STORES.QUEST_DECKS, STORES.QUEST_CARDS, STORES.INVENTORY, STORES.PLAYER_STATS, STORES.MUTATION_QUEUE],
    'readwrite',
    async (t) => {
      const deck = await req(t.objectStore(STORES.QUEST_DECKS).get(deckId));
      if (!deck || deck.exhausted) return;
      const cards = (await getAllFromIndex(t, STORES.QUEST_CARDS, 'deck_id', deckId))
        .sort((a, b) => a.position - b.position);
      const inventory = await req(t.objectStore(STORES.INVENTORY).getAll());
      const ownedMediaIds = new Set(inventory.filter(i => i.media_id != null).map(i => i.media_id));

      const card = findNextUnowned(cards, deck.current_position, ownedMediaIds);
      if (!card) return;
      const infusion = card.infusion || 0;
      const reward = Math.max(2, infusion * 2);

      const stats = await req(t.objectStore(STORES.PLAYER_STATS).get(1));
      t.objectStore(STORES.PLAYER_STATS).put({ id: 1, dust: (stats?.dust || 0) + reward });

      /* Remove the card from this deck (and reindex any later positions to
       * stay contiguous, mirroring destroyQuestCard.js). */
      t.objectStore(STORES.QUEST_CARDS).delete(card.card_id);
      const remaining = cards.filter(c => c.card_id !== card.card_id);
      let i = 0;
      for (const r of remaining) {
        if (r.position !== i) t.objectStore(STORES.QUEST_CARDS).put({ ...r, position: i });
        i++;
      }

      const newTotal = remaining.length;
      const newPos = deck.current_position >= newTotal ? newTotal : deck.current_position;
      const exhausted = newTotal === 0 || newPos >= newTotal;
      t.objectStore(STORES.QUEST_DECKS).put({
        ...deck,
        current_position: newPos,
        total_cards: newTotal,
        exhausted: exhausted ? 1 : 0,
      });
      if (exhausted) deleteQuestDeckInventory(t, inventory, deckId);

      enqueue(t, 'quest.destroy', { deckId });
    },
  );
  drainMutationQueue();
}

/**
 * Bump the infusion of a media item by `amount` (passive viewing reward,
 * LAW 4.13). Updates every quest_card row sharing the same media_id so
 * the in-flight quest UI reflects the new value immediately.
 */
export async function freeInfuseQuest(mediaId, amount = 1) {
  await tx(
    [STORES.QUEST_CARDS, STORES.MUTATION_QUEUE],
    'readwrite',
    async (t) => {
      const cards = await getAllFromIndex(t, STORES.QUEST_CARDS, 'media_id', mediaId);
      for (const c of cards) {
        t.objectStore(STORES.QUEST_CARDS).put({ ...c, infusion: (c.infusion || 0) + amount });
      }
      enqueue(t, 'media.freeInfuse', { mediaId, amount });
    },
  );
  drainMutationQueue();
}

/* Helper: remove the quest_deck inventory row for a deck that just exhausted. */
function deleteQuestDeckInventory(t, inventory, deckId) {
  for (const inv of inventory) {
    if (inv.card_type === CARD_TYPE.QUEST_DECK && inv.ref_id === deckId) {
      t.objectStore(STORES.INVENTORY).delete(inv.inventory_id);
    }
  }
}

/* ── Market ────────────────────────────────────────────────────── */

/**
 * Buy a memory ticket. LAW 4.12: 1 Đ. Optimistic dust deduction +
 * optimistic ticket inventory row (temp negative id, replaced by sync
 * after the server creates the real row).
 */
export async function buyMemoryTicket() {
  await tx(
    [STORES.PLAYER_STATS, STORES.INVENTORY, STORES.MUTATION_QUEUE],
    'readwrite',
    async (t) => {
      const stats = await req(t.objectStore(STORES.PLAYER_STATS).get(1));
      const dust = stats?.dust || 0;
      if (dust < MARKET_PRICES.memoryTicket) throw new Error('Not enough dust');

      t.objectStore(STORES.PLAYER_STATS).put({ id: 1, dust: dust - MARKET_PRICES.memoryTicket });
      t.objectStore(STORES.INVENTORY).put({
        inventory_id: -Date.now(),
        media_id: null,
        card_type: CARD_TYPE.MEMORY_TICKET,
        ref_id: null,
        acquired_at: new Date().toISOString(),
      });
      enqueue(t, 'market.buyTicket', {});
    },
  );
  drainMutationQueue();
}

/**
 * Buy an extra quest deck. LAW 4.12: 5 Đ. The server generates the deck
 * and its 10 cards in one transaction; we can't predict either, so we
 * deduct dust optimistically and let the post-push reconcile add the
 * new quest_decks / quest_cards / inventory rows.
 */
export async function buyQuestDeck() {
  await tx(
    [STORES.PLAYER_STATS, STORES.MUTATION_QUEUE],
    'readwrite',
    async (t) => {
      const stats = await req(t.objectStore(STORES.PLAYER_STATS).get(1));
      const dust = stats?.dust || 0;
      if (dust < MARKET_PRICES.questDeck) throw new Error('Not enough dust');

      t.objectStore(STORES.PLAYER_STATS).put({ id: 1, dust: dust - MARKET_PRICES.questDeck });
      enqueue(t, 'market.buyDeck', {});
    },
  );
  drainMutationQueue();
}

/* ── Memory game ───────────────────────────────────────────────── */

/**
 * Consume a memory_ticket inventory row. Pass an explicit `invId` to
 * target a specific ticket; otherwise the oldest ticket is used.
 *
 * Returns `{ tickets }` — the count of remaining ticket rows after the
 * consume — to match the legacy `useMemoryTicket` API contract.
 */
export async function consumeMemoryTicket(invId) {
  const result = await tx(
    [STORES.INVENTORY, STORES.MUTATION_QUEUE],
    'readwrite',
    async (t) => {
      const all = await req(t.objectStore(STORES.INVENTORY).getAll());
      const tickets = all.filter(i => i.card_type === CARD_TYPE.MEMORY_TICKET);
      /* Fall back to "any ticket" if a stale id was passed (e.g. the
       * inventory page held a temp negative id that was already replaced
       * by a real one during reconcile). */
      const target = (invId != null && tickets.find(t => t.inventory_id === invId))
        || tickets[0];
      if (!target) throw new Error('No tickets available');
      t.objectStore(STORES.INVENTORY).delete(target.inventory_id);
      enqueue(t, 'memory.useTicket', { invId: target.inventory_id });
      return { tickets: tickets.length - 1 };
    },
  );
  drainMutationQueue();
  return result;
}

/**
 * Add a media item to inventory with an optional infusion bonus
 * (LAW 4.17: memory game pick = +10). Returns `{ added }` matching the
 * legacy `addToInventory` API contract; `added` is false if the media
 * was already in inventory.
 */
export async function addToInventory(mediaId, infuseBonus = 0) {
  const result = await tx(
    [STORES.INVENTORY, STORES.MEDIA, STORES.MUTATION_QUEUE],
    'readwrite',
    async (t) => {
      const existing = await req(
        t.objectStore(STORES.INVENTORY).index('media_id').get(mediaId),
      );
      if (existing) return { added: false };

      const media = await req(t.objectStore(STORES.MEDIA).get(mediaId));
      if (!media) throw new Error('Media not found');

      if (infuseBonus > 0) {
        t.objectStore(STORES.MEDIA).put({
          ...media,
          infusion: (media.infusion || 0) + infuseBonus,
        });
      }

      /* Optimistic insert with a temp negative inventory_id; the post-push
       * sync replaces the row with the server-assigned id. The shape mirrors
       * what listInventory returns (joined inventory + media fields). */
      const tempInvId = -Date.now();
      t.objectStore(STORES.INVENTORY).put({
        inventory_id: tempInvId,
        media_id: mediaId,
        card_type: CARD_TYPE.MEDIA,
        ref_id: null,
        acquired_at: new Date().toISOString(),
        ...media,
        infusion: (media.infusion || 0) + infuseBonus,
        id: mediaId,
      });

      enqueue(t, 'inventory.add', { mediaId, infuseBonus });
      return { added: true };
    },
  );
  drainMutationQueue();
  return result;
}
