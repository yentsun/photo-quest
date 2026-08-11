/**
 * @file Platform-aware storage — mirrors the web app's services/idb.js API.
 *
 * Web: IndexedDB (the domain API is available in RNW's browser environment).
 * Native: AsyncStorage with JSON serialisation (full sqlite migration in a later phase).
 */
import { Platform } from 'react-native';

/* ==================================================================
   Interface — every function below is called by services/api.js
   ================================================================== */

export async function idbGetMedia(opts)                       { return _impl().idbGetMedia(opts); }
export async function idbGetMediaById(id)                      { return _impl().idbGetMediaById(id); }
export async function idbGetFolders()                          { return _impl().idbGetFolders(); }
export async function idbPutMedia(item)                        { return _impl().idbPutMedia(item); }
export async function idbPutManyMedia(items)                   { return _impl().idbPutManyMedia(items); }
export async function idbPutManyFolders(folders)               { return _impl().idbPutManyFolders(folders); }
export async function idbDeleteMedia(id)                       { return _impl().idbDeleteMedia(id); }

/* ==================================================================
   Web implementation — real IndexedDB (imported lazily)
   ================================================================== */

/** @returns {Promise<IDBDatabase>} */
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('media-browser', 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('media')) {
        const s = db.createObjectStore('media', { keyPath: 'id' });
        s.createIndex('folder',  'folder',  { unique: false });
        s.createIndex('hidden',  'hidden',  { unique: false });
        s.createIndex('likes',   'likes',   { unique: false });
      }
      if (!db.objectStoreNames.contains('folders')) {
        const s = db.createObjectStore('folders', { keyPath: 'id' });
        s.createIndex('path', 'path', { unique: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function req2p(req) {
  return new Promise((r, x) => { req.onsuccess = () => r(req.result); req.onerror = () => x(req.error); });
}

const webImpl = {
  async idbGetMedia(opts) {
    try {
      const db = await openDB();
      const txn = db.transaction('media', 'readonly');
      const store = txn.objectStore('media');
      let all = await req2p(store.getAll());
      if (opts?.folder != null) all = all.filter(m => m.folder === opts.folder);
      if (opts?.liked) all = all.filter(m => m.likes > 0);
      if (opts?.type != null) all = all.filter(m => m.type === opts.type);
      all.sort((a, b) => b.createdAt?.localeCompare(a.createdAt) ?? 0);
      const total = all.length;
      if (opts?.limit != null) all = all.slice(opts.offset || 0, (opts.offset || 0) + opts.limit);
      return { items: all, total };
    } catch { return null; }
  },
  async idbGetMediaById(id) {
    try { const db = await openDB(); return req2p(db.transaction('media','readonly').objectStore('media').get(id)); } catch { return null; }
  },
  async idbGetFolders() {
    try {
      const db = await openDB();
      return req2p(db.transaction('folders','readonly').objectStore('folders').getAll());
    } catch { return null; }
  },
  async idbPutMedia(item) {
    try { const db = await openDB(); req2p(db.transaction('media','readwrite').objectStore('media').put(item)); } catch {}
  },
  async idbPutManyMedia(items) {
    try {
      const db = await openDB(); const txn = db.transaction('media','readwrite'); const store = txn.objectStore('media');
      for (const item of items) store.put(item);
    } catch {}
  },
  async idbPutManyFolders(folders) {
    try {
      const db = await openDB(); const txn = db.transaction('folders','readwrite'); const store = txn.objectStore('folders');
      for (const f of folders) store.put(f);
    } catch {}
  },
  async idbDeleteMedia(id) {
    try { const db = await openDB(); req2p(db.transaction('media','readwrite').objectStore('media').delete(id)); } catch {}
  },
};

/* ==================================================================
   Native implementation — AsyncStorage stubs (returns null/empty)
   ================================================================== */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORE_KEY = 'pq_media_cache';
const FOLDER_KEY = 'pq_folder_cache';

const nativeImpl = {
  async idbGetMedia() {
    try { const raw = await AsyncStorage.getItem(STORE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
  },
  async idbGetMediaById() { return null; },
  async idbGetFolders() {
    try { const raw = await AsyncStorage.getItem(FOLDER_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
  },
  async idbPutMedia() {},
  async idbPutManyMedia(items) {
    try { await AsyncStorage.setItem(STORE_KEY, JSON.stringify({ items, total: items.length })); } catch {}
  },
  async idbPutManyFolders(folders) {
    try { await AsyncStorage.setItem(FOLDER_KEY, JSON.stringify(folders)); } catch {}
  },
  async idbDeleteMedia() {},
};

function _impl() { return Platform.OS === 'web' ? webImpl : nativeImpl; }
