/**
 * @file IndexedDB wrapper for offline media snapshots.
 *
 * Mirrors the server's SQLite schema so the app can display previously loaded
 * media without a network connection. This is a cache / snapshot layer —
 * it stores whatever the server has returned so far, not a full sync.
 *
 * Stores:
 *  - media   — mirrors the `media` SQL table (keyPath: id)
 *  - folders — mirrors the `folders` SQL table plus server-computed fields
 *              (parentId, subtreeCounts, previewMediaId)
 */

const DB_NAME = 'media-browser';
const DB_VERSION = 1;

/** Singleton DB connection, initialised on first call to openDB(). */
let _db = null;

/**
 * Open (or return the cached) database connection, running any schema
 * upgrades needed for the current DB_VERSION.
 *
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      /* media store — mirrors the server's `media` SQLite table. */
      if (!db.objectStoreNames.contains('media')) {
        const store = db.createObjectStore('media', { keyPath: 'id' });
        store.createIndex('folder',  'folder',  { unique: false });
        store.createIndex('hidden',  'hidden',  { unique: false });
        store.createIndex('likes',   'likes',   { unique: false });
        store.createIndex('type',    'type',    { unique: false });
      }

      /* folders store — mirrors server's `folders` table + computed fields. */
      if (!db.objectStoreNames.contains('folders')) {
        const store = db.createObjectStore('folders', { keyPath: 'id' });
        store.createIndex('path',     'path',     { unique: true });
        store.createIndex('parentId', 'parentId', { unique: false });
      }
    };

    req.onsuccess = () => {
      _db = req.result;
      /* Reset singleton if the connection is closed (e.g. during page navigation)
         so the next openDB() call gets a fresh connection instead of a stale one. */
      _db.onclose = () => { _db = null; };
      resolve(_db);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Wrap an IDBRequest in a Promise.
 * @param {IDBRequest} req
 * @returns {Promise<any>}
 */
function req2p(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror  = () => reject(req.error);
  });
}

/**
 * Read all records from a store.
 * @param {IDBDatabase} db
 * @param {string} storeName
 * @returns {Promise<any[]>}
 */
function getAll(db, storeName) {
  const tx    = db.transaction(storeName, 'readonly');
  const store = tx.objectStore(storeName);
  return req2p(store.getAll());
}

/**
 * Upsert (put) multiple records into a store in a single transaction.
 * @param {IDBDatabase} db
 * @param {string} storeName
 * @param {any[]} records
 * @returns {Promise<void>}
 */
function putMany(db, storeName, records) {
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    for (const record of records) store.put(record);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

/**
 * Upsert a single media item into the IDB media store.
 * @param {Object} item
 */
export async function idbPutMedia(item) {
  const db = await openDB();
  const tx = db.transaction('media', 'readwrite');
  tx.objectStore('media').put(item);
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
  });
}

/**
 * Upsert multiple media items into the IDB media store.
 * @param {Object[]} items
 */
export async function idbPutManyMedia(items) {
  if (!items?.length) return;
  const db = await openDB();
  return putMany(db, 'media', items);
}

/**
 * Read a single media item by numeric ID.
 * @param {number} id
 * @returns {Promise<Object|undefined>}
 */
export async function idbGetMediaById(id) {
  const db = await openDB();
  const tx = db.transaction('media', 'readonly');
  return req2p(tx.objectStore('media').get(id));
}

/**
 * Read media items from IDB, applying the same filters as the server's
 * listMedia op (folder, subtree, liked, limit, offset).
 *
 * @param {{ folder?: string, subtree?: boolean, liked?: boolean, limit?: number, offset?: number }} opts
 * @returns {Promise<{ items: Object[], total: number }>}
 */
export async function idbGetMedia({ folder, subtree, liked, limit, offset } = {}) {
  const db = await openDB();
  let items = await getAll(db, 'media');

  /* Mirror server's WHERE hidden = 0 */
  items = items.filter(m => m.hidden === 0);

  /* Mirror server's folder / subtree filter */
  if (folder != null) {
    if (subtree) {
      /* Server does: folder = ? OR folder LIKE '.../%' */
      const prefix = folder.replace(/\\/g, '/') + '/';
      items = items.filter(m =>
        m.folder === folder ||
        (m.folder && m.folder.replace(/\\/g, '/').startsWith(prefix))
      );
    } else {
      items = items.filter(m => m.folder === folder);
    }
  }

  /* Mirror server's liked filter */
  if (liked) {
    items = items.filter(m => m.likes > 0);
  }

  /* Mirror server's ORDER BY */
  if (liked) {
    items.sort((a, b) => b.likes - a.likes);
  } else {
    items.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }

  const total = items.length;

  /* Mirror server's LIMIT / OFFSET */
  const start = offset ?? 0;
  const slice = limit != null ? items.slice(start, start + limit) : items.slice(start);

  return { items: slice, total };
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

/**
 * Upsert the full folders list (with server-computed fields) into IDB.
 * @param {Object[]} folders
 */
export async function idbPutManyFolders(folders) {
  if (!folders?.length) return;
  const db = await openDB();
  return putMany(db, 'folders', folders);
}

/**
 * Read all folders from IDB.
 * @returns {Promise<Object[]>}
 */
export async function idbGetFolders() {
  const db = await openDB();
  return getAll(db, 'folders');
}
