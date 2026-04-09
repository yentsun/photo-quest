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

/* ── Inventory ─────────────────────────────────────────────────── */

/**
 * Sell an inventory card back to the library. LAW 4.15: reward = infusion.
 * Removes the inventory row locally and credits dust immediately.
 */
export async function sellInventory(invId) {
  await tx(
    [STORES.INVENTORY, STORES.PLAYER_STATS, STORES.MUTATION_QUEUE],
    'readwrite',
    async (t) => {
      const inv = await req(t.objectStore(STORES.INVENTORY).get(invId));
      if (!inv) throw new Error('Inventory item not found');
      const stats = await req(t.objectStore(STORES.PLAYER_STATS).get(1));
      const reward = inv.infusion || 0;
      t.objectStore(STORES.INVENTORY).delete(invId);
      t.objectStore(STORES.PLAYER_STATS).put({ id: 1, dust: (stats?.dust || 0) + reward });
      enqueue(t, 'inventory.sell', { invId });
    },
  );
  drainMutationQueue();
}

/**
 * Destroy an inventory card — removes the underlying media too.
 * LAW 4.10: reward = max(2, infusion * 2).
 */
export async function destroyInventory(invId) {
  await tx(
    [STORES.INVENTORY, STORES.PLAYER_STATS, STORES.MUTATION_QUEUE],
    'readwrite',
    async (t) => {
      const inv = await req(t.objectStore(STORES.INVENTORY).get(invId));
      if (!inv) throw new Error('Inventory item not found');
      const stats = await req(t.objectStore(STORES.PLAYER_STATS).get(1));
      const reward = Math.max(2, (inv.infusion || 0) * 2);
      t.objectStore(STORES.INVENTORY).delete(invId);
      t.objectStore(STORES.PLAYER_STATS).put({ id: 1, dust: (stats?.dust || 0) + reward });
      enqueue(t, 'inventory.destroy', { invId });
    },
  );
  drainMutationQueue();
}

/* ── Decks ─────────────────────────────────────────────────────── */

/**
 * Add inventory cards to an existing deck. LAW 4.18: each card receives
 * +10 infusion the first time it lands in a deck, but the local replica
 * doesn't track per-deck membership in Phase 2 — we apply +10 optimistically
 * and let the post-push sync correct it if the server determined the card
 * was already a member.
 *
 * groupedIds is updated immediately so the inventory page can re-flow
 * "ungrouped" cards into the deck row.
 */
export async function addToDeck(deckId, inventoryIds) {
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

/**
 * Delete a deck. Cards stay in inventory and become "ungrouped" — but
 * since we don't mirror deck_cards locally, we can't know which cards
 * were in this specific deck. The next sync will repopulate groupedIds
 * authoritatively.
 */
export async function deleteDeck(deckId) {
  await tx(
    [STORES.DECKS, STORES.MUTATION_QUEUE],
    'readwrite',
    async (t) => {
      t.objectStore(STORES.DECKS).delete(deckId);
      enqueue(t, 'deck.delete', { deckId });
    },
  );
  drainMutationQueue();
}
