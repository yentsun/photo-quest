/**
 * @file Web Worker that runs all sync and mutation-queue logic off the
 * main thread. Fetches from the API, writes to IndexedDB, and posts
 * store-update messages back so the main-thread hooks can re-read.
 */

import { MEDIA_TYPE } from '@photo-quest/shared';
import {
  fetchInventory, fetchDecks, fetchPlayerStats, fetchQuestDecks, fetchMedia,
  sellInventoryItem, destroyInventoryItem, getImageUrl,
  createDeck as apiCreateDeck, renameDeck as apiRenameDeck,
  deleteDeck as apiDeleteDeck, addToDeck as apiAddToDeck,
  advanceQuestDeck as apiAdvanceQuestDeck, takeQuestCard as apiTakeQuestCard,
  destroyQuestCard as apiDestroyQuestCard, freeInfuseMedia as apiFreeInfuseMedia,
  addToInventory as apiAddToInventory, useMemoryTicket as apiUseMemoryTicket,
  buyMemoryTicket as apiBuyMemoryTicket, buyQuestDeck as apiBuyQuestDeck,
} from '../utils/api.js';
import {
  snapshotReplace, putRow, getAll, tx, req, STORES,
} from './localDb.js';

/* ── Helpers ─────────────────────────────────────────────────────── */

/** Tell the main thread which stores changed so it can notify hooks. */
function updated(stores) {
  self.postMessage({ type: 'stores-updated', stores: Array.isArray(stores) ? stores : [stores] });
}

function toast(message, level = 'error') {
  self.postMessage({ type: 'toast', message, level });
}

/* ── Sync functions ──────────────────────────────────────────────── */

async function syncInventory() {
  try {
    const { items } = await fetchInventory();
    await snapshotReplace(STORES.INVENTORY, items || []);
    updated(STORES.INVENTORY);
  } catch (err) {
    console.warn('syncInventory failed:', err.message);
  }
}

async function syncDecks() {
  try {
    const { decks, groupedIds, cards } = await fetchDecks();
    await Promise.all([
      snapshotReplace(STORES.DECKS, decks || []),
      snapshotReplace(STORES.DECK_CARDS, cards || []),
      putRow(STORES.META, { key: 'groupedIds', value: groupedIds || [] }),
    ]);
    updated([STORES.DECKS, STORES.DECK_CARDS, STORES.META]);
  } catch (err) {
    console.warn('syncDecks failed:', err.message);
  }
}

async function syncPlayerStats() {
  try {
    const { dust } = await fetchPlayerStats();
    await putRow(STORES.PLAYER_STATS, { id: 1, dust });
    updated(STORES.PLAYER_STATS);
  } catch (err) {
    console.warn('syncPlayerStats failed:', err.message);
  }
}

async function syncQuestsFromResult(result) {
  if (!result) return;
  const { decks = [], cards = [] } = result;
  await Promise.all([
    snapshotReplace(STORES.QUEST_DECKS, decks),
    snapshotReplace(STORES.QUEST_CARDS, cards),
  ]);
  updated([STORES.QUEST_DECKS, STORES.QUEST_CARDS]);
}

async function syncQuests() {
  try {
    await syncQuestsFromResult(await fetchQuestDecks());
  } catch (err) {
    console.warn('syncQuests failed:', err.message);
  }
}

const OFFLINE_IMAGE_WARM_COUNT = 50;
let warmedThisSession = false;

async function syncMedia() {
  try {
    const { items } = await fetchMedia();
    await snapshotReplace(STORES.MEDIA, items || []);
    updated(STORES.MEDIA);

    if (!warmedThisSession) {
      warmedThisSession = true;
      const toWarm = (items || [])
        .filter(m => m.type === MEDIA_TYPE.IMAGE && !m.hidden)
        .sort((a, b) => (b.infusion || 0) - (a.infusion || 0))
        .slice(0, OFFLINE_IMAGE_WARM_COUNT);
      for (const m of toWarm) fetch(getImageUrl(m.id)).catch(() => {});
    }
  } catch (err) {
    console.warn('syncMedia failed:', err.message);
  }
}

async function syncTable(table) {
  switch (table) {
    case STORES.INVENTORY:    return syncInventory();
    case STORES.DECKS:
    case STORES.DECK_CARDS:
      return syncDecks();
    case STORES.PLAYER_STATS: return syncPlayerStats();
    case STORES.QUEST_DECKS:
    case STORES.QUEST_CARDS:
      return syncQuests();
    case STORES.MEDIA:        return syncMedia();
    default: throw new Error(`Unknown sync table: ${table}`);
  }
}

async function syncAll() {
  const questResult = await fetchQuestDecks().catch(() => null);

  await Promise.all([
    syncInventory(),
    syncDecks(),
    syncPlayerStats(),
    syncQuestsFromResult(questResult),
  ]);

  // Media is huge — run after game-critical stores are done.
  syncMedia();
}

/* ── Mutation queue drain ────────────────────────────────────────── */

const MAX_ATTEMPTS = 3;

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
    return [STORES.INVENTORY];
  },
  'memory.useTicket': async ({ invId }) => {
    await apiUseMemoryTicket(invId > 0 ? invId : undefined);
    return [STORES.INVENTORY];
  },
  'market.buyTicket': async () => {
    await apiBuyMemoryTicket();
    return [STORES.INVENTORY, STORES.PLAYER_STATS];
  },
  'market.buyDeck': async () => {
    await apiBuyQuestDeck();
    return [STORES.INVENTORY, STORES.PLAYER_STATS, STORES.QUEST_DECKS];
  },
};

let draining = false;

async function drainMutationQueue() {
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
          toast(`Sync failed: ${err.message}`);
          await deleteQueueRow(next.id);
          await Promise.all([syncInventory(), syncDecks(), syncPlayerStats()]);
        } else {
          await bumpQueueAttempts(next.id, attempts, err.message);
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

/* ── Message handler ─────────────────────────────────────────────── */

self.onmessage = ({ data }) => {
  switch (data.type) {
    case 'sync-all':    syncAll(); break;
    case 'sync-table':  syncTable(data.table); break;
    case 'drain-queue': drainMutationQueue(); break;
  }
};
