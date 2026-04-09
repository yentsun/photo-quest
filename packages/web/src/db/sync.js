/**
 * @file Pull/push engine for the local IndexedDB replica.
 *
 * Phase 1: full-snapshot pulls of inventory, decks, player_stats. Single-
 * device assumption means anything missing from the server response is
 * deleted locally — no tombstone log needed.
 *
 * Phase 2: optimistic mutation queue drain. Actions in `db/actions.js`
 * apply optimistic local updates and enqueue rows here; `drainMutationQueue`
 * pushes them to the server in FIFO order, then re-pulls the affected
 * tables so any divergence (server enforcing LAW 4.18, dust rounding,
 * etc.) is corrected. Server is the source of truth.
 */

import {
  fetchInventory, fetchDecks, fetchPlayerStats, fetchQuestDecks, fetchMedia,
  sellInventoryItem, destroyInventoryItem,
  createDeck as apiCreateDeck, renameDeck as apiRenameDeck,
  deleteDeck as apiDeleteDeck, addToDeck as apiAddToDeck,
  advanceQuestDeck as apiAdvanceQuestDeck, takeQuestCard as apiTakeQuestCard,
  destroyQuestCard as apiDestroyQuestCard, freeInfuseMedia as apiFreeInfuseMedia,
  addToInventory as apiAddToInventory, useMemoryTicket as apiUseMemoryTicket,
} from '../utils/api.js';
import {
  snapshotReplace, putRow, getAll, tx, req, STORES,
} from './localDb.js';
import { showToast } from '../components/ToasterMessage.jsx';

/**
 * Pull every table from the server. Errors are logged but never thrown so
 * the UI keeps rendering whatever's in the local store (LAW 1.10).
 */
export async function syncAll() {
  /* fetchQuestDecks both triggers daily generation server-side AND returns
   * today's deck/card snapshot. Must finish before syncInventory so the new
   * quest_deck inventory rows show up in the same pass. */
  const questResult = await fetchQuestDecks().catch(() => null);

  await Promise.all([
    syncInventory(),
    syncDecks(),
    syncPlayerStats(),
    syncQuestsFromResult(questResult),
  ]);
}

export async function syncTable(table) {
  switch (table) {
    case STORES.INVENTORY:    return syncInventory();
    case STORES.DECKS:        return syncDecks();
    case STORES.PLAYER_STATS: return syncPlayerStats();
    case STORES.QUEST_DECKS:
    case STORES.QUEST_CARDS:
      return syncQuests();
    case STORES.MEDIA:        return syncMedia();
    default: throw new Error(`Unknown sync table: ${table}`);
  }
}

async function syncQuests() {
  try {
    syncQuestsFromResult(await fetchQuestDecks());
  } catch (err) {
    console.warn('syncQuests failed:', err.message);
  }
}

async function syncQuestsFromResult(result) {
  if (!result) return;
  const { decks = [], cards = [] } = result;
  await Promise.all([
    snapshotReplace(STORES.QUEST_DECKS, decks),
    snapshotReplace(STORES.QUEST_CARDS, cards),
  ]);
}

/**
 * Pull the full media library into local IDB. Called on demand (e.g. by
 * MemoryGamePage) — not in syncAll because the table can be large (LAW
 * 1.36: 10k+ items) and there's no `?since=` delta support yet.
 */
export async function syncMedia() {
  try {
    const { items } = await fetchMedia();
    await snapshotReplace(STORES.MEDIA, items || []);
  } catch (err) {
    console.warn('syncMedia failed:', err.message);
  }
}

async function syncInventory() {
  try {
    const { items } = await fetchInventory();
    await snapshotReplace(STORES.INVENTORY, items || []);
  } catch (err) {
    console.warn('syncInventory failed:', err.message);
  }
}

async function syncDecks() {
  try {
    const { piles, groupedIds } = await fetchDecks();
    await snapshotReplace(STORES.DECKS, piles || []);
    /* groupedIds — inventory_ids that belong to *any* deck — kept under a
     * fixed meta key so the inventory page can filter "ungrouped" cards. */
    await putRow(STORES.META, { key: 'groupedIds', value: groupedIds || [] });
  } catch (err) {
    console.warn('syncDecks failed:', err.message);
  }
}

async function syncPlayerStats() {
  try {
    const { dust } = await fetchPlayerStats();
    await putRow(STORES.PLAYER_STATS, { id: 1, dust });
  } catch (err) {
    console.warn('syncPlayerStats failed:', err.message);
  }
}

/* ── Mutation queue drain ──────────────────────────────────────── */

const MAX_ATTEMPTS = 3;

/**
 * Push a queued mutation to the server. Returns the list of local stores
 * that need to be re-pulled afterwards to reconcile any divergence.
 */
const HANDLERS = {
  'inventory.sell': async ({ invId }) => {
    await sellInventoryItem(invId);
    return [STORES.INVENTORY, STORES.PLAYER_STATS];
  },
  'inventory.destroy': async ({ invId }) => {
    await destroyInventoryItem(invId);
    return [STORES.INVENTORY, STORES.PLAYER_STATS];
  },
  'deck.create': async ({ name, inventoryIds }) => {
    await apiCreateDeck(name, inventoryIds);
    return [STORES.INVENTORY, STORES.DECKS];
  },
  'deck.add': async ({ deckId, inventoryIds }) => {
    await apiAddToDeck(deckId, inventoryIds);
    return [STORES.INVENTORY, STORES.DECKS];
  },
  'deck.rename': async ({ deckId, name }) => {
    await apiRenameDeck(deckId, name);
    return [STORES.DECKS];
  },
  'deck.delete': async ({ deckId }) => {
    await apiDeleteDeck(deckId);
    return [STORES.DECKS, STORES.INVENTORY];
  },
  'quest.advance': async ({ deckId }) => {
    await apiAdvanceQuestDeck(deckId);
    return [STORES.QUEST_DECKS, STORES.INVENTORY];
  },
  'quest.take': async ({ deckId }) => {
    await apiTakeQuestCard(deckId);
    return [STORES.QUEST_DECKS, STORES.INVENTORY, STORES.PLAYER_STATS];
  },
  'quest.destroy': async ({ deckId }) => {
    await apiDestroyQuestCard(deckId);
    return [STORES.QUEST_DECKS, STORES.QUEST_CARDS, STORES.INVENTORY, STORES.PLAYER_STATS];
  },
  'media.freeInfuse': async ({ mediaId, amount }) => {
    await apiFreeInfuseMedia(mediaId, amount);
    return [STORES.QUEST_DECKS];
  },
  'inventory.add': async ({ mediaId, infuseBonus }) => {
    await apiAddToInventory(mediaId, { infuseBonus });
    return [STORES.INVENTORY, STORES.MEDIA];
  },
  'memory.useTicket': async ({ invId }) => {
    await apiUseMemoryTicket(invId);
    return [STORES.INVENTORY];
  },
};

let draining = false;

/**
 * Serial FIFO drain of the local mutation queue. On success: delete the
 * row + reconcile affected tables. On failure: bump `attempts` and either
 * leave the row for retry (transient) or drop it after MAX_ATTEMPTS with
 * a toast + force-sync (permanent — server-wins rollback).
 */
export async function drainMutationQueue() {
  if (draining) return;
  draining = true;
  try {
    while (true) {
      const all = await getAll(STORES.MUTATION_QUEUE);
      const next = all[0];
      if (!next) break;

      const handler = HANDLERS[next.type];
      if (!handler) {
        console.warn('Unknown mutation type, dropping:', next.type);
        await deleteQueueRow(next.id);
        continue;
      }

      try {
        const reconcileTables = await handler(next.payload);
        await deleteQueueRow(next.id);
        await Promise.all((reconcileTables || []).map(syncTable));
      } catch (err) {
        const attempts = (next.attempts || 0) + 1;
        if (attempts >= MAX_ATTEMPTS) {
          console.error('Mutation failed permanently:', next.type, err);
          showToast(`Sync failed: ${err.message}`, 'error');
          await deleteQueueRow(next.id);
          /* Force-sync everything the failed mutation might have touched
           * so the optimistic local state is overwritten by the truth. */
          await Promise.all([syncInventory(), syncDecks(), syncPlayerStats()]);
        } else {
          await bumpQueueAttempts(next.id, attempts, err.message);
          /* Stop draining on transient errors so we don't busy-loop on a
           * down server. The next mutation, focus, or sync will retry. */
          break;
        }
      }
    }
  } finally {
    draining = false;
  }
}

async function deleteQueueRow(id) {
  await tx(STORES.MUTATION_QUEUE, 'readwrite', (t) => {
    t.objectStore(STORES.MUTATION_QUEUE).delete(id);
  });
}

async function bumpQueueAttempts(id, attempts, lastError) {
  await tx(STORES.MUTATION_QUEUE, 'readwrite', async (t) => {
    const row = await req(t.objectStore(STORES.MUTATION_QUEUE).get(id));
    if (row) t.objectStore(STORES.MUTATION_QUEUE).put({ ...row, attempts, lastError });
  });
}
