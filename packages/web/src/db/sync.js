/**
 * @file Pull/push engine for the local IndexedDB replica.
 *
 * Phase 1: full-snapshot pulls of inventory, decks, player_stats. Single-
 * device assumption means anything missing from the server response is
 * deleted locally — no tombstone log needed.
 */

import { fetchInventory, fetchDecks, fetchPlayerStats, fetchQuestDecks } from '../utils/api.js';
import { snapshotReplace, putRow, STORES } from './localDb.js';

/**
 * Pull every table from the server. Errors are logged but never thrown so
 * the UI keeps rendering whatever's in the local store (LAW 1.10).
 */
export async function syncAll() {
  /* Triggers daily quest_decks generation server-side; must complete
   * before syncInventory or the new quest_deck inventory rows get missed. */
  await fetchQuestDecks().catch(() => {});

  await Promise.all([
    syncInventory(),
    syncDecks(),
    syncPlayerStats(),
  ]);
}

/** @param {'inventory'|'decks'|'player_stats'} table */
export async function syncTable(table) {
  switch (table) {
    case STORES.INVENTORY:    return syncInventory();
    case STORES.DECKS:        return syncDecks();
    case STORES.PLAYER_STATS: return syncPlayerStats();
    default: throw new Error(`Unknown sync table: ${table}`);
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
