/**
 * @file Sync worker — fetches server state and writes to IndexedDB off
 * the main thread. All HTTP + IDB work happens here so the UI stays
 * responsive and the main thread never talks to the backend.
 *
 * Protocol:
 *   main → worker: { type: 'sync-all', serverUrl }
 *                  { type: 'start-events', serverUrl }
 *                  { type: 'stop-events' }
 *                  { type: 'mutate', id, serverUrl, method, path, body? }
 *   worker → main: { type: 'progress', store, count, total }
 *                  { type: 'done' }
 *                  { type: 'error', message }
 *                  { type: 'change', table, version }
 *                  { type: 'mutate-result', id, ok, status, data?, message? }
 */

import { openDb, STORES, syncReplace, tx, req } from './localDb.js';

const PAGE_SIZE = 100;
const PAGE_CONCURRENCY = 4;

/**
 * Pending optimistic writes win over server snapshots. If any mutation
 * is queued we skip snapshot replacement entirely — once the queue
 * drains, the server's own change event will re-trigger a resync and
 * the snapshot will then contain our applied mutations.
 */
async function hasPendingMutations() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORES.PENDING_MUTATIONS, 'readonly');
    const r = t.objectStore(STORES.PENDING_MUTATIONS).count();
    r.onsuccess = () => resolve(r.result > 0);
    r.onerror   = () => reject(r.error);
  });
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

/**
 * Paginated, diff-only sync (LAW 1.40). Loads the current store state
 * once, fetches all server pages to build the diff in memory, then
 * applies puts + prune in a single atomic transaction. Readers never
 * see a partial update — optimistic rows and their server counterparts
 * swap in one commit, so no gap is visible (LAW 1.38).
 */
async function syncPaged(serverUrl, path, store) {
  const snap = await readKeyedJson(store);
  const seenKeys = new Set();
  const changedRows = [];

  function diffPage(items) {
    if (!items?.length) return;
    for (const row of items) {
      const key = row[snap.keyPath];
      seenKeys.add(key);
      const j = JSON.stringify(row);
      if (snap.map.get(key) !== j) {
        changedRows.push(row);
        snap.map.set(key, j);
      }
    }
  }

  const first = await fetchJson(`${serverUrl}${path}?limit=${PAGE_SIZE}&offset=0`);
  const total = first.total ?? first.items.length;
  diffPage(first.items);
  let count = first.items.length;
  self.postMessage({ type: 'progress', store, count, total });

  const offsets = [];
  for (let o = count; o < total; o += PAGE_SIZE) offsets.push(o);

  /* Cap concurrency so we don't saturate the server when there are many pages. */
  for (let i = 0; i < offsets.length; i += PAGE_CONCURRENCY) {
    const batch = offsets.slice(i, i + PAGE_CONCURRENCY);
    const pages = await Promise.all(
      batch.map(o => fetchJson(`${serverUrl}${path}?limit=${PAGE_SIZE}&offset=${o}`)),
    );
    for (const page of pages) {
      if (!page.items?.length) continue;
      diffPage(page.items);
      count += page.items.length;
    }
    self.postMessage({ type: 'progress', store, count, total });
  }

  /* Prune targets are computed from the snapshot we already have —
   * no read inside the write tx, so no `await` that could let IDB
   * auto-commit between puts and deletes. A buy's optimistic row
   * (in snap.map, not in seenKeys) is deleted in the same commit
   * that puts its real server counterpart, so the UI flips
   * forming→ready in one atomic step. */
  const keysToPrune = [];
  for (const key of snap.map.keys()) if (!seenKeys.has(key)) keysToPrune.push(key);

  if (!changedRows.length && !keysToPrune.length) return;

  /* Re-check just before write: a mutation queued mid-fetch means the
   * server response is now stale relative to the optimistic IDB row.
   * Applying the diff would clobber the user's typed value with the
   * pre-rename server data. Bail; the post-drain sync will reconcile. */
  if (await hasPendingMutations()) return;

  await tx(store, 'readwrite', (t) => {
    const os = t.objectStore(store);
    for (const row of changedRows) os.put(row);
    for (const key of keysToPrune) os.delete(key);
  });
}

async function readKeyedJson(store) {
  return tx(store, 'readonly', async (t) => {
    const os = t.objectStore(store);
    const kp = os.keyPath;
    const rows = await req(os.getAll());
    return { keyPath: kp, map: new Map(rows.map(r => [r[kp], JSON.stringify(r)])) };
  });
}

const syncInventory = (serverUrl) => syncPaged(serverUrl, '/inventory', STORES.CARDS);

async function syncDecks(serverUrl) {
  const { decks = [], cards = [] } = await fetchJson(`${serverUrl}/decks`);
  console.debug('[worker] syncDecks diffing:', decks.length, 'decks,', cards.length, 'deckCards');
  if (await hasPendingMutations()) return;
  await Promise.all([
    syncReplace(STORES.DECKS,      decks),
    syncReplace(STORES.DECK_CARDS, cards),
  ]);
  self.postMessage({ type: 'progress', store: STORES.DECKS, count: decks.length, total: decks.length });
}

async function syncPlayer(serverUrl) {
  const row = await fetchJson(`${serverUrl}/player`);
  if (await hasPendingMutations()) return;
  await syncReplace(STORES.PLAYER_STATS, [{ id: 1, ...row }]);
}

async function syncFolders(serverUrl) {
  const folders = await fetchJson(`${serverUrl}/folders`);
  if (await hasPendingMutations()) return;
  await syncReplace(STORES.FOLDERS, folders);
  self.postMessage({ type: 'progress', store: STORES.FOLDERS, count: folders.length, total: folders.length });
}

/* Folder counts & previews derive from the media table, so resync folders
 * whenever the server bumps the `media` channel (scan, delete). */
const TABLE_SYNCERS = {
  inventory: syncInventory,
  decks:     syncDecks,
  player:    syncPlayer,
  media:     syncFolders,
};

async function syncTable(serverUrl, table) {
  const fn = TABLE_SYNCERS[table];
  if (!fn) return;
  if (await hasPendingMutations()) {
    console.debug('[worker] syncTable', table, 'SKIPPED (pending queue)');
    return;
  }
  console.debug('[worker] syncTable', table, 'running');
  try { await fn(serverUrl); self.postMessage({ type: 'done' }); }
  catch (err) { self.postMessage({ type: 'error', message: err.message }); }
}

async function syncAll(serverUrl) {
  if (await hasPendingMutations()) {
    console.debug('[worker] syncAll SKIPPED (pending queue)');
    return;
  }
  console.debug('[worker] syncAll running');
  try {
    await Promise.all([
      syncInventory(serverUrl),
      syncDecks(serverUrl),
      syncPlayer(serverUrl),
      syncFolders(serverUrl),
    ]);
    self.postMessage({ type: 'done' });
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message });
  }
}

async function mutate(id, serverUrl, method, path, body) {
  try {
    const res = await fetch(`${serverUrl}${path}`, {
      method,
      headers: body != null ? { 'Content-Type': 'application/json' } : {},
      body:    body != null ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = null;
    if (text) { try { data = JSON.parse(text); } catch { data = text; } }
    if (!res.ok) {
      self.postMessage({ type: 'mutate-result', id, ok: false, status: res.status, message: data?.error || text || res.statusText });
      return;
    }
    self.postMessage({ type: 'mutate-result', id, ok: true, status: res.status, data });
  } catch (err) {
    self.postMessage({ type: 'mutate-result', id, ok: false, status: 0, message: err.message });
  }
}

let eventSource = null;
const debounceTimers = new Map();
const DEBOUNCE_MS = 75;

function scheduleResync(serverUrl, table) {
  clearTimeout(debounceTimers.get(table));
  debounceTimers.set(table, setTimeout(() => {
    debounceTimers.delete(table);
    syncTable(serverUrl, table);
  }, DEBOUNCE_MS));
}

function startEvents(serverUrl) {
  stopEvents();
  try {
    eventSource = new EventSource(`${serverUrl}/changes/events`);
  } catch (err) {
    self.postMessage({ type: 'error', message: `SSE: ${err.message}` });
    return;
  }
  eventSource.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    if (msg.type === 'snapshot') return; /* initial versions; ignored */
    if (msg.type === 'import_started' || msg.type === 'import_progress' || msg.type === 'import_complete') {
      /* Flip the pill to 'syncing' while the scan runs; surface progress
       * as a virtual '__scan' store so the existing percentage logic
       * applies. syncFolders will fire separately once the scan bumps
       * `media` at completion — that ends the 'syncing' phase. */
      if (msg.type === 'import_started') {
        self.postMessage({ type: 'change', table: '__scan' });
      }
      self.postMessage({
        type: 'progress',
        store: '__scan',
        count: msg.processed ?? 0,
        total: msg.total ?? 0,
      });
      return;
    }
    if (msg.table && msg.version) {
      self.postMessage({ type: 'change', table: msg.table, version: msg.version });
      scheduleResync(serverUrl, msg.table);
    }
  };
  eventSource.onerror = () => {
    /* EventSource auto-reconnects; surface the condition but keep it alive. */
    self.postMessage({ type: 'error', message: 'change stream disconnected, retrying…' });
  };
}

function stopEvents() {
  if (eventSource) { eventSource.close(); eventSource = null; }
  for (const id of debounceTimers.values()) clearTimeout(id);
  debounceTimers.clear();
}

let activeServerUrl = null;

self.onmessage = ({ data }) => {
  if (data.serverUrl) activeServerUrl = data.serverUrl;
  switch (data.type) {
    case 'sync-all':     syncAll(activeServerUrl); break;
    case 'start-events': startEvents(activeServerUrl); break;
    case 'stop-events':  stopEvents(); break;
    case 'mutate':       mutate(data.id, activeServerUrl, data.method, data.path, data.body); break;
  }
};
