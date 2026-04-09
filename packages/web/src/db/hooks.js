/**
 * @file React hooks that read from the local IndexedDB replica.
 *
 * Pages import these instead of calling `utils/api.js` directly. Each hook
 * subscribes to one or more stores via `localDb.subscribe()` and re-runs
 * its query whenever those stores change, so optimistic mutations and sync
 * pulls both update the UI automatically.
 *
 * Pattern (`useLocal`):
 *   1. Run `queryFn()` on mount and store the result in state.
 *   2. Subscribe to the named stores; on notify, re-run `queryFn()`.
 *   3. Cleanup unsubscribes and cancels any in-flight read.
 */

import { useEffect, useState, useRef } from 'react';
import { getAll, getByKey, subscribe } from './localDb.js';

/**
 * Generic live-query hook.
 *
 * @template T
 * @param {string|string[]} stores Stores to subscribe to.
 * @param {() => Promise<T>} queryFn Async query against the local store.
 * @param {T} initial Initial value before the first read resolves.
 * @returns {T}
 */
function useLocal(stores, queryFn, initial) {
  const [data, setData] = useState(initial);
  /* queryFn often comes from inline arrow functions, which would otherwise
   * destabilise the effect's identity. We pin it via ref so the effect's
   * dependency list can stay tied to `stores` only. */
  const queryRef = useRef(queryFn);
  queryRef.current = queryFn;

  const key = Array.isArray(stores) ? stores.join('|') : stores;

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      Promise.resolve(queryRef.current())
        .then(d => { if (!cancelled) setData(d); })
        .catch(err => console.error('useLocal query failed:', err));
    };
    run();
    const unsub = subscribe(stores, run);
    return () => { cancelled = true; unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return data;
}

/* ------------------------------------------------------------------ *
 *  Phase 1 hooks                                                      *
 * ------------------------------------------------------------------ */

/**
 * Inventory items as returned by `GET /inventory` (denormalized join of
 * inventory + media + quest_decks). The shape matches what
 * `InventoryPage` already expects.
 *
 * @returns {{ items: object[], total: number }}
 */
export function useInventory() {
  return useLocal(
    'inventory',
    async () => {
      const items = await getAll('inventory');
      return { items, total: items.length };
    },
    { items: [], total: 0 },
  );
}

/**
 * User decks as returned by `GET /decks`, plus the `groupedIds` set so
 * pages can filter ungrouped inventory cards. Subscribes to both stores.
 *
 * @returns {{ piles: object[], groupedIds: Set<number> }}
 */
export function useDecks() {
  return useLocal(
    ['decks', 'meta'],
    async () => {
      const [piles, groupedRow] = await Promise.all([
        getAll('decks'),
        getByKey('meta', 'groupedIds'),
      ]);
      return {
        piles,
        groupedIds: new Set(groupedRow?.value || []),
      };
    },
    { piles: [], groupedIds: new Set() },
  );
}

/**
 * Singleton player stats (currently just dust). Returns `null` until the
 * first sync completes so the dust badge can hide instead of flashing 0.
 *
 * @returns {{ dust: number } | null}
 */
export function usePlayerStats() {
  return useLocal(
    'player_stats',
    async () => {
      const row = await getByKey('player_stats', 1);
      return row ? { dust: row.dust } : null;
    },
    null,
  );
}
