/**
 * @file Sync worker — fetches server state and writes to IndexedDB off
 * the main thread. All HTTP + IDB work happens here so the UI stays
 * responsive even on slow connections or large snapshot replaces.
 *
 * Protocol:
 *   main → worker: { type: 'sync-all', serverUrl }
 *   worker → main: { type: 'progress', store, count, total }
 *                  { type: 'done' }
 *                  { type: 'error', message }
 */

import { STORES, snapshotReplace, clearStore, putRows } from './localDb.js';

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

async function syncDecks(serverUrl) {
  const data = await fetchJson(`${serverUrl}/decks`);
  const piles = data.piles || [];
  const cards = data.cards || [];
  const groupedIds = data.groupedIds || [];
  /* Stash grouped-ids as a singleton meta row keyed by id=0. */
  const deckRows = [...piles, { id: 0, __meta: true, groupedIds }];
  await Promise.all([
    snapshotReplace(STORES.DECKS,      deckRows),
    snapshotReplace(STORES.DECK_CARDS, cards),
  ]);
  self.postMessage({ type: 'progress', store: STORES.DECKS, count: piles.length, total: piles.length });
}

async function syncAll(serverUrl) {
  try {
    await Promise.all([syncInventory(serverUrl), syncDecks(serverUrl)]);
    self.postMessage({ type: 'done' });
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message });
  }
}

self.onmessage = ({ data }) => {
  if (data.type === 'sync-all') syncAll(data.serverUrl);
};
