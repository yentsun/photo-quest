/**
 * @file Main-thread bridge to the sync Web Worker.
 * All HTTP (sync, SSE, outgoing mutations) stays inside the worker.
 *
 * Mutations are queued to IDB (`pendingMutations`) before hitting the
 * network — the queue drains in order as soon as a worker is live.
 * This keeps the UI instant, survives reloads, and handles offline
 * windows without special-casing. GETs bypass the queue.
 */

import { openDb, STORES } from './localDb.js';
import { emitMutation } from './events.js';

let activeWorker = null;
let nextRpcId = 1;
const pending = new Map();

export function startSync(serverUrl, onStatus) {
  const worker = new Worker(
    new URL('./syncWorker.js', import.meta.url),
    { type: 'module' },
  );

  worker.onmessage = ({ data }) => {
    if (data.type === 'mutate-result') {
      const p = pending.get(data.id);
      if (!p) return;
      pending.delete(data.id);
      if (data.ok) p.resolve(data.data);
      else         p.reject(Object.assign(new Error(data.message || `HTTP ${data.status}`), { status: data.status }));
      return;
    }
    if (data.type === 'done') drainQueue();
    onStatus(data);
  };
  worker.onerror = (e) => onStatus({ type: 'error', message: e.message });

  worker.postMessage({ type: 'sync-all',     serverUrl });
  worker.postMessage({ type: 'start-events', serverUrl });

  activeWorker = worker;

  return () => {
    if (activeWorker === worker) activeWorker = null;
    for (const p of pending.values()) p.reject(new Error('sync stopped'));
    pending.clear();
    worker.postMessage({ type: 'stop-events' });
    worker.terminate();
  };
}

/**
 * Send a request through the active worker and resolve with the server
 * response. Used directly for GETs and internally by the queue drain.
 */
function sendDirect({ method, path, body }) {
  if (!activeWorker) return Promise.reject(Object.assign(new Error('Not connected to server'), { status: 0 }));
  const id = nextRpcId++;
  const p = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  activeWorker.postMessage({ type: 'mutate', id, method, path, body });
  return p;
}

/**
 * Queue a mutation and trigger a drain. Returns `{ __queued: true }`
 * immediately — callers rely on optimistic IDB writes for UI and the
 * drain's `then` refetch or SSE resync for authoritative reconciliation.
 *
 * GETs bypass the queue and resolve with the server's response.
 *
 * @param {object} req
 * @param {string} req.method — 'GET'|'POST'|'PATCH'|'DELETE'
 * @param {string} req.path
 * @param {*}      [req.body]
 * @param {{ method:string, path:string, store:string }} [req.then] —
 *   optional follow-up GET whose response is written to `store` after
 *   the main request succeeds.
 */
export async function mutate({ method, path, body, then }) {
  if (method === 'GET') return sendDirect({ method, path });
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.PENDING_MUTATIONS, 'readwrite');
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
    tx.objectStore(STORES.PENDING_MUTATIONS).add({ method, path, body, then, createdAt: Date.now() });
  });
  drainQueue();
  return { __queued: true };
}

/* ── Queue drain ─────────────────────────────────────────────────── */

let draining = false;

export async function drainQueue() {
  if (draining || !activeWorker) return;
  draining = true;
  try {
    while (activeWorker) {
      const head = await peekHead();
      if (!head) break;
      try {
        await sendDirect({ method: head.method, path: head.path, body: head.body });
        if (head.then) {
          const fresh = await sendDirect({ method: head.then.method, path: head.then.path });
          if (fresh) await putIntoStore(head.then.store, fresh);
        }
        await deleteHead(head.id);
      } catch (err) {
        if (err.status === 0) break; /* network — retry on next online */
        await deleteHead(head.id);   /* 4xx/5xx — can't retry, drop */
        console.warn(`mutation ${head.method} ${head.path} dropped:`, err.message);
      }
    }
  } finally {
    draining = false;
    emitMutation();
  }
}

async function peekHead() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.PENDING_MUTATIONS, 'readonly');
    const r  = tx.objectStore(STORES.PENDING_MUTATIONS).openCursor();
    r.onsuccess = () => resolve(r.result ? r.result.value : null);
    r.onerror   = () => reject(r.error);
  });
}

async function deleteHead(id) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.PENDING_MUTATIONS, 'readwrite');
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
    tx.objectStore(STORES.PENDING_MUTATIONS).delete(id);
  });
}

async function putIntoStore(store, row) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
    tx.objectStore(store).put(row);
  });
  emitMutation();
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => drainQueue());
}
