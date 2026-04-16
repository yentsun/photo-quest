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

import { STORES, clearStore, putRows, snapshotReplace } from './localDb.js';

const PAGE_SIZE = 100;
const PAGE_CONCURRENCY = 4;

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

async function syncPaged(serverUrl, path, store) {
  const first = await fetchJson(`${serverUrl}${path}?limit=${PAGE_SIZE}&offset=0`);
  const total = first.total ?? first.items.length;

  await clearStore(store);
  await putRows(store, first.items);
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
      await putRows(store, page.items);
      count += page.items.length;
    }
    self.postMessage({ type: 'progress', store, count, total });
  }
}

const syncInventory = (serverUrl) => syncPaged(serverUrl, '/inventory', STORES.CARDS);

async function syncDecks(serverUrl) {
  const { decks = [], cards = [] } = await fetchJson(`${serverUrl}/decks`);
  await Promise.all([
    snapshotReplace(STORES.DECKS,      decks),
    snapshotReplace(STORES.DECK_CARDS, cards),
  ]);
  self.postMessage({ type: 'progress', store: STORES.DECKS, count: decks.length, total: decks.length });
}

async function syncPlayer(serverUrl) {
  const row = await fetchJson(`${serverUrl}/player`);
  await snapshotReplace(STORES.PLAYER_STATS, [{ id: 1, ...row }]);
}

const TABLE_SYNCERS = {
  inventory: syncInventory,
  decks:     syncDecks,
  player:    syncPlayer,
};

async function syncTable(serverUrl, table) {
  const fn = TABLE_SYNCERS[table];
  if (!fn) return;
  try { await fn(serverUrl); self.postMessage({ type: 'done' }); }
  catch (err) { self.postMessage({ type: 'error', message: err.message }); }
}

async function syncAll(serverUrl) {
  try {
    await Promise.all([
      syncInventory(serverUrl),
      syncDecks(serverUrl),
      syncPlayer(serverUrl),
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
