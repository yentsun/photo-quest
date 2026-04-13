/**
 * @file Sync worker — fetches server state and writes to IndexedDB off
 * the main thread. All HTTP + IDB work happens here so the UI stays
 * responsive and the main thread never talks to the backend.
 *
 * Protocol:
 *   main → worker: { type: 'sync-all', serverUrl }
 *                  { type: 'start-events', serverUrl }
 *                  { type: 'stop-events' }
 *   worker → main: { type: 'progress', store, count, total }
 *                  { type: 'done' }
 *                  { type: 'error', message }
 *                  { type: 'change', table, version }
 */

import { STORES, clearStore, putRows } from './localDb.js';

const PAGE_SIZE = 100;

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

async function syncInventory(serverUrl) {
  const store = STORES.CARDS;
  const first = await fetchJson(`${serverUrl}/inventory?limit=${PAGE_SIZE}&offset=0`);
  const total = first.total ?? first.items.length;

  await clearStore(store);
  await putRows(store, first.items);
  let count = first.items.length;
  self.postMessage({ type: 'progress', store, count, total });

  while (count < total) {
    const page = await fetchJson(`${serverUrl}/inventory?limit=${PAGE_SIZE}&offset=${count}`);
    if (!page.items.length) break;
    await putRows(store, page.items);
    count += page.items.length;
    self.postMessage({ type: 'progress', store, count, total });
  }
}

/* Decks are PWA-owned: users build them locally, server never dictates
 * membership. No syncDecks — mutations stay in IDB. */

const TABLE_SYNCERS = {
  inventory: syncInventory,
};

async function syncTable(serverUrl, table) {
  const fn = TABLE_SYNCERS[table];
  if (!fn) return;
  try { await fn(serverUrl); self.postMessage({ type: 'done' }); }
  catch (err) { self.postMessage({ type: 'error', message: err.message }); }
}

async function syncAll(serverUrl) {
  try {
    await syncInventory(serverUrl);
    self.postMessage({ type: 'done' });
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message });
  }
}

/* ── SSE change stream ─────────────────────────────────────────────
 * EventSource runs inside the worker so the main thread never opens a
 * connection to the backend. Each `change` event triggers a per-table
 * resync; a brief debounce coalesces bursts (e.g. create-deck +
 * add-cards emits two events within a few ms). */

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

self.onmessage = ({ data }) => {
  switch (data.type) {
    case 'sync-all':     syncAll(data.serverUrl); break;
    case 'start-events': startEvents(data.serverUrl); break;
    case 'stop-events':  stopEvents(); break;
  }
};
