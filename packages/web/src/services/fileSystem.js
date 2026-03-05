/**
 * @file File System Access API service for managing folder handles.
 *
 * Stores directory handles in IndexedDB so they persist across sessions.
 * Provides methods to scan folders and read files without server paths.
 */

import { SUPPORTED_EXTENSIONS } from '@photo-quest/shared';

const DB_NAME = 'photo-quest-fs';
const STORE_NAME = 'handles';
const DB_VERSION = 1;

let db = null;

/**
 * Initialize IndexedDB for storing directory handles.
 */
async function initDb() {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

/**
 * Store a directory handle in IndexedDB.
 */
async function storeHandle(id, handle) {
  const database = await initDb();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put({ id, handle });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * Get a stored directory handle from IndexedDB.
 */
async function getHandle(id) {
  const database = await initDb();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result?.handle || null);
  });
}

/**
 * Get all stored handles.
 */
async function getAllHandles() {
  const database = await initDb();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || []);
  });
}

/**
 * Open native folder picker and store the handle.
 * @returns {Promise<{id: string, name: string, files: Array}>}
 */
export async function pickFolder() {
  const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
  const id = `folder-${Date.now()}`;
  const name = dirHandle.name;

  // Store handle for persistence
  await storeHandle(id, dirHandle);

  // Scan for media files
  const files = await scanDirectory(dirHandle, '');

  return { id, name, handle: dirHandle, files };
}

/**
 * Recursively scan a directory for media files.
 */
async function scanDirectory(dirHandle, path) {
  const files = [];

  for await (const entry of dirHandle.values()) {
    const entryPath = path ? `${path}/${entry.name}` : entry.name;

    if (entry.kind === 'directory') {
      const subFiles = await scanDirectory(entry, entryPath);
      files.push(...subFiles);
    } else if (entry.kind === 'file') {
      const ext = entry.name.toLowerCase().match(/\.[^.]+$/)?.[0];
      if (ext && SUPPORTED_EXTENSIONS.includes(ext)) {
        files.push({
          name: entry.name,
          path: entryPath,
          handle: entry,
        });
      }
    }
  }

  return files;
}

/**
 * Get a file's blob URL from a stored handle.
 */
export async function getFileUrl(folderId, filePath) {
  const dirHandle = await getHandle(folderId);
  if (!dirHandle) {
    throw new Error('Folder handle not found');
  }

  // Verify permission
  const permission = await dirHandle.queryPermission({ mode: 'read' });
  if (permission !== 'granted') {
    const newPermission = await dirHandle.requestPermission({ mode: 'read' });
    if (newPermission !== 'granted') {
      throw new Error('Permission denied');
    }
  }

  // Navigate to file
  const parts = filePath.split('/');
  let current = dirHandle;

  for (let i = 0; i < parts.length - 1; i++) {
    current = await current.getDirectoryHandle(parts[i]);
  }

  const fileHandle = await current.getFileHandle(parts[parts.length - 1]);
  const file = await fileHandle.getFile();
  return URL.createObjectURL(file);
}

/**
 * Check if File System Access API is supported.
 */
export function isFileSystemSupported() {
  return 'showDirectoryPicker' in window;
}

/**
 * Get all stored folders.
 */
export async function getStoredFolders() {
  const handles = await getAllHandles();
  const folders = [];

  for (const { id, handle } of handles) {
    try {
      // Check if we still have permission
      const permission = await handle.queryPermission({ mode: 'read' });
      folders.push({
        id,
        name: handle.name,
        hasPermission: permission === 'granted',
      });
    } catch {
      // Handle no longer valid
    }
  }

  return folders;
}
