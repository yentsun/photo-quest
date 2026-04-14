/**
 * @file Tiny IndexedDB wrapper shared by main thread and sync worker.
 *
 * The DB is a local replica of server state. Heavy writes (snapshot
 * replacement) run in the sync worker so the main thread stays responsive.
 */

const DB_NAME = 'photo-quest';
const DB_VERSION = 9;

export const STORES = {
  CARDS:              'cards',
  DECKS:              'decks',
  DECK_CARDS:         'deckCards',
  PLAYER_STATS:       'playerStats',
  QUEST_STATE:        'questState',
  PENDING_MUTATIONS:  'pendingMutations',
};

const SCHEMA = [
  { name: STORES.CARDS,             keyPath: 'inventory_id' },
  { name: STORES.DECKS,             keyPath: 'id' },
  { name: STORES.DECK_CARDS,        keyPath: 'inventory_id' },
  { name: STORES.PLAYER_STATS,      keyPath: 'id' },
  { name: STORES.QUEST_STATE,       keyPath: 'id' },
  { name: STORES.PENDING_MUTATIONS, keyPath: 'id', autoIncrement: true },
];

/* Stores that existed in earlier versions and should be cleaned up. */
const OBSOLETE_STORES = ['library', 'questDecks'];

let dbPromise = null;

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      /* Recreate pendingMutations so its autoIncrement flag is applied
       * (earlier versions created it without). Safe — the queue is
       * transient and empty on first drain. */
      if (db.objectStoreNames.contains(STORES.PENDING_MUTATIONS)) {
        db.deleteObjectStore(STORES.PENDING_MUTATIONS);
      }
      for (const { name, keyPath, autoIncrement } of SCHEMA) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath, autoIncrement });
        }
      }
      for (const name of OBSOLETE_STORES) {
        if (db.objectStoreNames.contains(name)) db.deleteObjectStore(name);
      }
    };
  });
  return dbPromise;
}

export async function countRows(store) {
  const db = await openDb();
  return await request(db.transaction(store, 'readonly').objectStore(store).count());
}

/** Replace a store's contents with `rows` in one transaction. */
export async function snapshotReplace(store, rows) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    const os = tx.objectStore(store);
    os.clear();
    for (const row of rows) os.put(row);
  });
}

export async function clearStore(store) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.objectStore(store).clear();
  });
}

export async function putRows(store, rows) {
  if (!rows.length) return;
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    const os = tx.objectStore(store);
    for (const row of rows) os.put(row);
  });
}

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
