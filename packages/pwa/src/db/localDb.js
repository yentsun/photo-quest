/**
 * @file Tiny IndexedDB wrapper shared by main thread and sync worker.
 *
 * The DB is a local replica of server state. Heavy writes (snapshot
 * replacement) run in the sync worker so the main thread stays responsive.
 */

const DB_NAME = 'photo-quest';
const DB_VERSION = 5;

export const STORES = {
  CARDS:      'cards',
  DECKS:      'decks',
  DECK_CARDS: 'deckCards',
};

const SCHEMA = [
  { name: STORES.CARDS,      keyPath: 'inventory_id' },
  { name: STORES.DECKS,      keyPath: 'id' },
  { name: STORES.DECK_CARDS, keyPath: 'inventory_id' },
];

let dbPromise = null;

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const { name, keyPath } of SCHEMA) {
        if (db.objectStoreNames.contains(name)) db.deleteObjectStore(name);
        db.createObjectStore(name, { keyPath });
      }
    };
  });
  return dbPromise;
}

/** Promisify a single IDBRequest. Use inside a `tx` callback to await reads. */
export function req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Run a transaction and resolve with whatever the callback returns once the
 * txn commits. `stores` may be a name or an array. The callback receives the
 * IDBTransaction and can await IDB requests (via `req`) across continuations
 * as long as it only does IDB work.
 */
export async function tx(stores, mode, fn) {
  const db = await openDb();
  const list = Array.isArray(stores) ? stores : [stores];
  let result;
  await new Promise((resolve, reject) => {
    const t = db.transaction(list, mode);
    t.oncomplete = () => resolve();
    t.onerror    = () => reject(t.error);
    t.onabort    = () => reject(t.error);
    Promise.resolve(fn(t)).then(v => { result = v; }).catch(reject);
  });
  return result;
}

export function countRows(store) {
  return tx(store, 'readonly', (t) => req(t.objectStore(store).count()));
}

/** Replace a store's contents with `rows` in one transaction. */
export function snapshotReplace(store, rows) {
  return tx(store, 'readwrite', (t) => {
    const os = t.objectStore(store);
    os.clear();
    for (const row of rows) os.put(row);
  });
}

export function clearStore(store) {
  return tx(store, 'readwrite', (t) => t.objectStore(store).clear());
}

export function putRows(store, rows) {
  if (!rows.length) return Promise.resolve();
  return tx(store, 'readwrite', (t) => {
    const os = t.objectStore(store);
    for (const row of rows) os.put(row);
  });
}
