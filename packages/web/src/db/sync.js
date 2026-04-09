/**
 * @file Pull/push engine for the local IndexedDB replica.
 *
 * Phase 1: read-only sync of inventory, decks, and player_stats.
 *
 * Pull strategy: full-snapshot replace. Single-device assumption means
 * anything missing from the server response is deleted locally — no
 * tombstone log needed. Each table has its own `syncTable*` worker; they
 * are safe to run in parallel because each one writes to its own store
 * inside its own transaction.
 *
 * Push strategy is deferred to Phase 2 (`drainMutationQueue` is still a
 * stub). Pages can keep calling the existing `utils/api.js` mutation
 * functions in the meantime — they'll trigger a server-side change and
 * the next pull picks it up.
 */

import { fetchInventory, fetchDecks, fetchPlayerStats, fetchQuestDecks } from '../utils/api.js';
import { snapshotReplace, putRow, notify } from './localDb.js';

/**
 * Pull every table from the server. Called on app mount, on tab focus, and
 * after relevant SSE events. Errors are logged but never thrown — the UI
 * keeps rendering whatever's in the local store (LAW 1.10).
 */
export async function syncAll() {
  /* fire-and-forget the daily quest deck generation; we discard the result
   * because Phase 1 only needs inventory/decks/player_stats locally.
   * The /quest/decks endpoint inserts today's quest_deck inventory rows
   * server-side as a side effect, which the next inventory pull will pick
   * up. */
  fetchQuestDecks().catch(() => {});

  await Promise.all([
    syncInventory(),
    syncDecks(),
    syncPlayerStats(),
  ]);
}

/**
 * Pull a single table. Convenience used by SSE handlers and individual
 * pages that want to refresh just one slice.
 *
 * @param {'inventory'|'decks'|'player_stats'} table
 */
export async function syncTable(table) {
  switch (table) {
    case 'inventory':    return syncInventory();
    case 'decks':        return syncDecks();
    case 'player_stats': return syncPlayerStats();
    default: throw new Error(`Unknown sync table: ${table}`);
  }
}

async function syncInventory() {
  try {
    const { items } = await fetchInventory();
    await snapshotReplace('inventory', items || []);
  } catch (err) {
    console.warn('syncInventory failed:', err.message);
  }
}

async function syncDecks() {
  try {
    const { piles, groupedIds } = await fetchDecks();
    await snapshotReplace('decks', piles || []);
    /* groupedIds is the list of inventory_ids that belong to *any* deck.
     * Stored under a fixed meta key so the inventory page can filter
     * "ungrouped" cards locally. */
    await putRow('meta', { key: 'groupedIds', value: groupedIds || [] });
    /* Re-notify the inventory store too — pages that read both decks and
     * inventory should re-render after a deck change. */
    notify('inventory');
  } catch (err) {
    console.warn('syncDecks failed:', err.message);
  }
}

async function syncPlayerStats() {
  try {
    const { dust } = await fetchPlayerStats();
    await putRow('player_stats', { id: 1, dust });
  } catch (err) {
    console.warn('syncPlayerStats failed:', err.message);
  }
}

/**
 * Drain the mutation queue: serial FIFO push of pending mutations to the
 * server, with reconciliation of the response into the local store.
 *
 * Phase 1: no-op. Implementation lands in Phase 2 alongside `actions.js`.
 */
export async function drainMutationQueue() {
  // TODO Phase 2.
}
