/**
 * @file Local IndexedDB replica of server game state.
 *
 * The PWA mirrors the server's authoritative SQLite tables into IndexedDB so
 * pages can read/write game state without a server round-trip. The server
 * (`packages/server`) remains the source of truth — `sync.js` keeps the
 * local replica in step.
 *
 * This file owns:
 *  - The schema declaration (object stores + indexes).
 *  - A thin promisified wrapper around the raw IndexedDB API.
 *  - A pub/sub layer (`subscribe` / `notify`) that React hooks use to
 *    re-render when the underlying stores change.
 *
 * No third-party dependency. The wrapper deliberately exposes only the
 * operations the rest of `db/` actually uses; if a new operation is needed,
 * add it here rather than reaching for raw IDB at the call site.
 *
 * DB name `photo-quest-local` is intentionally distinct from
 * `photo-quest-fs` (used by `services/fileSystem.js`) so version chains
 * never collide.
 */

const DB_NAME = 'photo-quest-local';
const DB_VERSION = 1;

/**
 * Schema declaration. Each entry is a store with its primary key and
 * (optional) indexes. The upgrade routine creates anything that doesn't
 * already exist, so adding a new store + bumping `DB_VERSION` is enough.
 *
 * Compound index syntax: `keyPath: ['a', 'b']` mirrors SQLite's
 * `UNIQUE(a, b)` when `unique: true`.
 *
 * Phase 1 only needs inventory / decks / player_stats / meta. Later phases
 * will add deck_cards (with the LAW 4.18 compound unique index),
 * quest_decks, quest_cards, media, mutation_queue, sync_state.
 */
const SCHEMA = [
  {
    name: 'inventory',
    keyPath: 'inventory_id',
    indexes: [
      // media_id is UNIQUE on the server; this gives O(1) "is owned?" lookups.
      { name: 'media_id', keyPath: 'media_id', unique: true },
      { name: 'card_type', keyPath: 'card_type' },
    ],
  },
  {
    name: 'decks',
    keyPath: 'id',
  },
  {
    // Singleton row keyed by id=1, mirrors server's player_stats table.
    name: 'player_stats',
    keyPath: 'id',
  },
  {
    // Misc key/value singletons (e.g. groupedIds for the inventory page).
    name: 'meta',
    keyPath: 'key',
  },
];

/* ------------------------------------------------------------------ *
 *  Connection                                                         *
 * ------------------------------------------------------------------ */

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      for (const def of SCHEMA) {
        if (!database.objectStoreNames.contains(def.name)) {
          const store = database.createObjectStore(def.name, { keyPath: def.keyPath });
          for (const idx of def.indexes || []) {
            store.createIndex(idx.name, idx.keyPath, { unique: !!idx.unique });
          }
        }
      }
    };
  });
  return dbPromise;
}

/* ------------------------------------------------------------------ *
 *  Request -> Promise helper                                          *
 * ------------------------------------------------------------------ */

function req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/* ------------------------------------------------------------------ *
 *  Read helpers                                                       *
 * ------------------------------------------------------------------ */

export async function getAll(storeName) {
  const db = await openDb();
  const tx = db.transaction(storeName, 'readonly');
  return req(tx.objectStore(storeName).getAll());
}

export async function getByKey(storeName, key) {
  const db = await openDb();
  const tx = db.transaction(storeName, 'readonly');
  return req(tx.objectStore(storeName).get(key));
}

export async function getByIndex(storeName, indexName, value) {
  const db = await openDb();
  const tx = db.transaction(storeName, 'readonly');
  return req(tx.objectStore(storeName).index(indexName).get(value));
}

/* ------------------------------------------------------------------ *
 *  Write helpers                                                      *
 * ------------------------------------------------------------------ */

/**
 * Atomically replace the contents of a store with a fresh array of rows.
 * Used by `sync.js` for full-snapshot pulls.
 *
 * Notifies subscribers of `storeName` once after the transaction commits.
 */
export async function snapshotReplace(storeName, rows) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    store.clear();
    for (const row of rows) store.put(row);
  });
  notify(storeName);
}

/**
 * Put (insert-or-update) a single row, then notify subscribers.
 */
export async function putRow(storeName, row) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    tx.objectStore(storeName).put(row);
  });
  notify(storeName);
}

/* ------------------------------------------------------------------ *
 *  Pub/sub for reactivity                                             *
 * ------------------------------------------------------------------ */

const subscribers = new Map(); // store name -> Set<fn>

/**
 * Subscribe a callback to one or more stores. Returns an unsubscribe fn.
 *
 * Callback fires whenever any of the named stores has been mutated via
 * one of the helpers in this file (or by `notify()` from elsewhere).
 *
 * @param {string|string[]} stores
 * @param {() => void} fn
 * @returns {() => void} unsubscribe
 */
export function subscribe(stores, fn) {
  const list = Array.isArray(stores) ? stores : [stores];
  for (const s of list) {
    if (!subscribers.has(s)) subscribers.set(s, new Set());
    subscribers.get(s).add(fn);
  }
  return () => {
    for (const s of list) subscribers.get(s)?.delete(fn);
  };
}

/**
 * Notify subscribers of one or more stores. Each callback is invoked at
 * most once per call, even if it's subscribed to multiple of the named
 * stores.
 *
 * @param {string|string[]} stores
 */
export function notify(stores) {
  const list = Array.isArray(stores) ? stores : [stores];
  const called = new Set();
  for (const s of list) {
    const set = subscribers.get(s);
    if (!set) continue;
    for (const fn of set) {
      if (called.has(fn)) continue;
      called.add(fn);
      try { fn(); } catch (err) { console.error('subscriber error', err); }
    }
  }
}
