/**
 * @file React hooks that read from the local IndexedDB replica.
 *
 * Pages import these instead of calling `utils/api.js` directly. Each hook
 * subscribes to one or more stores via `localDb.subscribe()` and re-runs
 * its query whenever those stores change.
 */

import { useEffect, useState, useRef } from 'react';
import { getAll, getByKey, subscribe, STORES } from './localDb.js';

/* Stable references for hooks that subscribe to multiple stores —
 * avoids re-subscribing on every render. */
const DECKS_STORES = [STORES.DECKS, STORES.META];

/**
 * Generic live-query hook.
 *
 * @template T
 * @param {string|string[]} stores Stores to subscribe to. Must be a stable
 *   reference (string literal or module-scoped array) — passing a fresh
 *   array each render will re-subscribe every time.
 * @param {() => Promise<T>} queryFn Async query against the local store.
 * @param {T} initial Initial value before the first read resolves.
 * @returns {T}
 */
function useLocal(stores, queryFn, initial) {
  const [data, setData] = useState(initial);
  const queryRef = useRef(queryFn);
  /* Pin queryFn via ref so the effect's deps stay tied to `stores` only.
   * Updated in an effect (not during render) to stay safe under
   * Concurrent Mode and StrictMode double-invocation. */
  useEffect(() => { queryRef.current = queryFn; });

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
  }, [stores]);

  return data;
}

/**
 * Inventory items as returned by `GET /inventory`. Shape matches what
 * `InventoryPage` already expects.
 *
 * @returns {{ items: object[], total: number }}
 */
export function useInventory() {
  return useLocal(
    STORES.INVENTORY,
    async () => {
      const items = await getAll(STORES.INVENTORY);
      return { items, total: items.length };
    },
    { items: [], total: 0 },
  );
}

/**
 * User decks plus the `groupedIds` set so pages can filter ungrouped
 * inventory cards.
 *
 * @returns {{ piles: object[], groupedIds: Set<number> }}
 */
export function useDecks() {
  return useLocal(
    DECKS_STORES,
    async () => {
      const [piles, groupedRow] = await Promise.all([
        getAll(STORES.DECKS),
        getByKey(STORES.META, 'groupedIds'),
      ]);
      return { piles, groupedIds: new Set(groupedRow?.value || []) };
    },
    { piles: [], groupedIds: new Set() },
  );
}

/**
 * Singleton player stats. Returns `null` until the first sync completes
 * so the dust badge can hide instead of flashing 0.
 *
 * @returns {{ dust: number } | null}
 */
export function usePlayerStats() {
  return useLocal(
    STORES.PLAYER_STATS,
    async () => {
      const row = await getByKey(STORES.PLAYER_STATS, 1);
      return row ? { dust: row.dust } : null;
    },
    null,
  );
}
