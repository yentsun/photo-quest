/**
 * @file Local IndexedDB replica of server game state.
 *
 * `photo-quest-local` is intentionally distinct from `photo-quest-fs`
 * (used by `services/fileSystem.js`) so version chains never collide.
 */

const DB_NAME = 'photo-quest-local';
const DB_VERSION = 1;

/** Canonical store names — import everywhere instead of raw strings. */
export const STORES = {
  INVENTORY: 'inventory',
  DECKS: 'decks',
  PLAYER_STATS: 'player_stats',
  META: 'meta',
};

const SCHEMA = [
  {
    name: STORES.INVENTORY,
    keyPath: 'inventory_id',
    indexes: [
      // media_id is UNIQUE on the server; gives O(1) "is owned?" lookups.
      { name: 'media_id', keyPath: 'media_id', unique: true },
      { name: 'card_type', keyPath: 'card_type' },
    ],
  },
  { name: STORES.DECKS, keyPath: 'id' },
  { name: STORES.PLAYER_STATS, keyPath: 'id' }, // Singleton, id=1
  { name: STORES.META, keyPath: 'key' },        // Misc key/value singletons
];

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

function req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAll(storeName) {
  const db = await openDb();
  return req(db.transaction(storeName, 'readonly').objectStore(storeName).getAll());
}

export async function getByKey(storeName, key) {
  const db = await openDb();
  return req(db.transaction(storeName, 'readonly').objectStore(storeName).get(key));
}

/** Replace store contents in one transaction; notifies subscribers on commit. */
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

const subscribers = new Map(); // store name -> Set<fn>

/**
 * Subscribe a callback to one or more stores. Returns an unsubscribe fn.
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
 * Notify subscribers of one or more stores. Each callback fires at most
 * once per call even when subscribed to multiple of the named stores.
 *
 * @param {string|string[]} stores
 */
function notify(stores) {
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
