/**
 * @file Tiny IndexedDB wrapper shared by main thread and sync worker.
 *
 * The DB is a local replica of server state. Heavy writes (snapshot
 * replacement) run in the sync worker so the main thread stays responsive.
 */

const DB_NAME = 'photo-quest';
const DB_VERSION = 14;

export const STORES = {
  CARDS:              'cards',
  DECKS:              'decks',
  DECK_CARDS:         'deckCards',
  FOLDERS:            'folders',
  PLAYER_STATS:       'playerStats',
  QUEST_STATE:        'questState',
  MEMORY_STATE:       'memoryState',
  SEEN_MEDIA:         'seenMedia',
  PENDING_MUTATIONS:  'pendingMutations',
  MEDIA_BLOBS:        'mediaBlobs',
  MEDIA_BLOB_FAILS:   'mediaBlobFails',
};

const SCHEMA = [
  { name: STORES.CARDS,             keyPath: 'inventory_id' },
  { name: STORES.DECKS,             keyPath: 'id' },
  { name: STORES.DECK_CARDS,        keyPath: 'inventory_id' },
  { name: STORES.FOLDERS,           keyPath: 'id' },
  { name: STORES.PLAYER_STATS,      keyPath: 'id' },
  { name: STORES.QUEST_STATE,       keyPath: 'id' },
  { name: STORES.MEMORY_STATE,      keyPath: 'id' },
  /* Media the player has actually been shown (current quest card on
   * each step + every memory game card on game start). The market
   * lists these minus what's already in inventory, so unopened decks
   * and unused tickets don't leak into the market. */
  { name: STORES.SEEN_MEDIA,        keyPath: 'id' },
  { name: STORES.PENDING_MUTATIONS, keyPath: 'id', autoIncrement: true },
  /* Media binaries kept here (not Cache API) because Chrome pads opaque
   * cross-origin responses to ~7 MB each in quota — even with CORS+
   * crossorigin attributes, the cache is unreliable for large libraries.
   * Blobs in IDB are byte-accurate and survive across sessions. */
  { name: STORES.MEDIA_BLOBS,       keyPath: 'id', indexes: [{ name: 'lastUsed', keyPath: 'lastUsed' }] },
  /* Tombstones for media ids that returned 404 / corrupt / unreadable.
   * Keeps the worker from re-fetching the same broken ids on every sync
   * and logging server errors. Cleared by an explicit user retry. */
  { name: STORES.MEDIA_BLOB_FAILS,  keyPath: 'id' },
];

/* Stores that existed in earlier versions and should be cleaned up. */
const OBSOLETE_STORES = ['library', 'questDecks'];

let dbPromise = null;

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      /* Recreate pendingMutations so its autoIncrement flag is applied
       * (earlier versions created it without). Safe — the queue is
       * transient and empty on first drain. */
      if (db.objectStoreNames.contains(STORES.PENDING_MUTATIONS)) {
        db.deleteObjectStore(STORES.PENDING_MUTATIONS);
      }
      for (const { name, keyPath, autoIncrement, indexes } of SCHEMA) {
        let os;
        if (!db.objectStoreNames.contains(name)) {
          os = db.createObjectStore(name, { keyPath, autoIncrement });
        } else {
          os = request.transaction.objectStore(name);
        }
        if (indexes) {
          for (const ix of indexes) {
            if (!os.indexNames.contains(ix.name)) os.createIndex(ix.name, ix.keyPath);
          }
        }
      }
      for (const name of OBSOLETE_STORES) {
        if (db.objectStoreNames.contains(name)) db.deleteObjectStore(name);
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

/**
 * LAW 1.40: reconcile a store's contents with `rows` by writing only
 * the minimal delta — put added or changed rows, delete rows the
 * server no longer returns. Identical rows are skipped entirely so
 * readers don't observe a no-op churn.
 *
 * The diff is computed in a readonly pre-pass so the readwrite tx
 * contains only synchronous puts and deletes — no `await` inside it,
 * so IDB can't auto-commit between operations.
 */
export async function syncReplace(store, rows) {
  const snap = await tx(store, 'readonly', async (t) => {
    const os = t.objectStore(store);
    return { keyPath: os.keyPath, existing: await req(os.getAll()) };
  });
  const prevJson = new Map(snap.existing.map(r => [r[snap.keyPath], JSON.stringify(r)]));
  const seen = new Set();
  const toPut = [];
  for (const row of rows) {
    const key = row[snap.keyPath];
    seen.add(key);
    const nextJson = JSON.stringify(row);
    if (prevJson.get(key) !== nextJson) toPut.push(row);
  }
  const toDelete = [];
  for (const key of prevJson.keys()) if (!seen.has(key)) toDelete.push(key);
  if (!toPut.length && !toDelete.length) return;
  /* In-tx pending check (CLAUDE.md PWA & sync rule): a mutation queued
   * between the readonly snapshot and the write tx makes the server
   * response stale relative to the optimistic IDB row. Skip the write;
   * the post-drain sync re-runs once the queue is empty. */
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const t = db.transaction([store, STORES.PENDING_MUTATIONS], 'readwrite');
    t.oncomplete = resolve;
    t.onerror    = () => reject(t.error);
    const countReq = t.objectStore(STORES.PENDING_MUTATIONS).count();
    countReq.onsuccess = () => {
      if (countReq.result > 0) return;
      const os = t.objectStore(store);
      for (const row of toPut) os.put(row);
      for (const key of toDelete) os.delete(key);
    };
  });
}

export function putRows(store, rows) {
  if (!rows.length) return Promise.resolve();
  return tx(store, 'readwrite', (t) => {
    const os = t.objectStore(store);
    for (const row of rows) os.put(row);
  });
}

/* ── Media blob helpers ───────────────────────────────────────────── */

const MEDIA_BLOB_BUDGET = 1500;

export function getMediaBlob(id) {
  return tx(STORES.MEDIA_BLOBS, 'readonly', (t) =>
    req(t.objectStore(STORES.MEDIA_BLOBS).get(id)),
  );
}

export async function hasMediaBlob(id) {
  const row = await tx(STORES.MEDIA_BLOBS, 'readonly', (t) =>
    req(t.objectStore(STORES.MEDIA_BLOBS).getKey(id)),
  );
  return row != null;
}

export async function putMediaBlob(id, blob) {
  await tx(STORES.MEDIA_BLOBS, 'readwrite', (t) => {
    t.objectStore(STORES.MEDIA_BLOBS).put({ id, blob, size: blob.size, lastUsed: Date.now() });
  });
  /* Best-effort LRU prune outside the write tx. */
  evictMediaBlobs().catch(() => {});
}

async function evictMediaBlobs() {
  const count = await tx(STORES.MEDIA_BLOBS, 'readonly', (t) =>
    req(t.objectStore(STORES.MEDIA_BLOBS).count()),
  );
  if (count <= MEDIA_BLOB_BUDGET) return;
  const drop = count - MEDIA_BLOB_BUDGET;
  await tx(STORES.MEDIA_BLOBS, 'readwrite', async (t) => {
    const ix = t.objectStore(STORES.MEDIA_BLOBS).index('lastUsed');
    const cursor = ix.openKeyCursor();
    let removed = 0;
    cursor.onsuccess = () => {
      const c = cursor.result;
      if (!c || removed >= drop) return;
      t.objectStore(STORES.MEDIA_BLOBS).delete(c.primaryKey);
      removed++;
      c.continue();
    };
  });
}

export async function touchMediaBlob(id) {
  await tx(STORES.MEDIA_BLOBS, 'readwrite', async (t) => {
    const os = t.objectStore(STORES.MEDIA_BLOBS);
    const row = await req(os.get(id));
    if (row) os.put({ ...row, lastUsed: Date.now() });
  });
}

export async function markMediaBlobFailed(id, status) {
  await tx(STORES.MEDIA_BLOB_FAILS, 'readwrite', (t) => {
    t.objectStore(STORES.MEDIA_BLOB_FAILS).put({ id, status, at: Date.now() });
  });
}

export async function hasMediaBlobFailed(id) {
  const key = await tx(STORES.MEDIA_BLOB_FAILS, 'readonly', (t) =>
    req(t.objectStore(STORES.MEDIA_BLOB_FAILS).getKey(id)),
  );
  return key != null;
}
