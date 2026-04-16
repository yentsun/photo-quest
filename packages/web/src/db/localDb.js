/**
 * @file Local IndexedDB replica of server game state.
 *
 * `photo-quest-local` is intentionally distinct from `photo-quest-fs`
 * (used by `services/fileSystem.js`) so version chains never collide.
 */

const DB_NAME = 'photo-quest-local';
const DB_VERSION = 5;

/** Canonical store names — import everywhere instead of raw strings. */
export const STORES = {
  INVENTORY: 'inventory',
  DECKS: 'decks',
  DECK_CARDS: 'deck_cards',
  PLAYER_STATS: 'player_stats',
  META: 'meta',
  MUTATION_QUEUE: 'mutation_queue',
  QUEST_DECKS: 'quest_decks',
  QUEST_CARDS: 'quest_cards',
  MEDIA: 'media',
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
  // Denormalized deck membership; compound PK mirrors server's UNIQUE.
  {
    name: STORES.DECK_CARDS,
    keyPath: ['deck_id', 'inventory_id'],
    indexes: [
      { name: 'deck_id', keyPath: 'deck_id' },
      { name: 'inventory_id', keyPath: 'inventory_id' },
    ],
  },
  { name: STORES.PLAYER_STATS, keyPath: 'id' }, // Singleton, id=1
  { name: STORES.META, keyPath: 'key' },        // Misc key/value singletons
  // Persistent push queue for optimistic mutations awaiting server ack.
  { name: STORES.MUTATION_QUEUE, keyPath: 'id', autoIncrement: true },
  // Today's quest decks (non-exhausted only).
  { name: STORES.QUEST_DECKS, keyPath: 'id' },
  /* Denormalized quest_cards: each row carries the joined media fields so
   * QuestPage can render entirely from local IDB. media_id index is used
   * for free-infuse fanout when the same media appears in multiple decks. */
  {
    name: STORES.QUEST_CARDS,
    keyPath: 'card_id',
    indexes: [
      { name: 'deck_id', keyPath: 'deck_id' },
      { name: 'media_id', keyPath: 'media_id' },
    ],
  },
  /* Full library media. Populated on-demand by callers that need it
   * (memory game) — not pulled in syncAll because the table can be
   * large (LAW 1.36: 10k+ items) and there's no `?since=` support yet. */
  {
    name: STORES.MEDIA,
    keyPath: 'id',
    indexes: [
      { name: 'type', keyPath: 'type' },
      { name: 'hidden', keyPath: 'hidden' },
    ],
  },
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
          const store = database.createObjectStore(def.name, {
            keyPath: def.keyPath,
            autoIncrement: !!def.autoIncrement,
          });
          for (const idx of def.indexes || []) {
            store.createIndex(idx.name, idx.keyPath, { unique: !!idx.unique });
          }
        }
      }
    };
  });
  return dbPromise;
}

/** Promisify a single IDBRequest. Exported for use inside `tx` callbacks. */
export function req(request) {
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

export async function getAllByIndex(storeName, indexName, key) {
  const db = await openDb();
  return req(db.transaction(storeName, 'readonly').objectStore(storeName).index(indexName).getAll(key));
}

/**
 * Run a multi-store transaction. The callback receives the IDBTransaction
 * and can await IDB requests inside it (modern browsers keep the txn alive
 * across microtask continuations as long as it's only IDB work). Don't
 * await non-IDB Promises inside `fn` — that will let the txn auto-commit.
 *
 * Auto-notifies subscribers of every store touched in `'readwrite'` mode.
 */
export async function tx(stores, mode, fn) {
  const db = await openDb();
  const list = Array.isArray(stores) ? stores : [stores];
  let result;
  await new Promise((resolve, reject) => {
    const t = db.transaction(list, mode);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
    Promise.resolve(fn(t)).then(r => { result = r; }).catch(reject);
  });
  if (mode === 'readwrite') notify(list);
  return result;
}

/** Replace store contents in one transaction; notifies subscribers on commit. */
export async function snapshotReplace(storeName, rows) {
  return tx(storeName, 'readwrite', (t) => {
    const store = t.objectStore(storeName);
    store.clear();
    for (const row of rows) store.put(row);
  });
}

export async function putRow(storeName, row) {
  return tx(storeName, 'readwrite', (t) => {
    t.objectStore(storeName).put(row);
  });
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
