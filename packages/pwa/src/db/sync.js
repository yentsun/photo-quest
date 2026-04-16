/**
 * @file Main-thread bridge to the sync Web Worker.
 * All HTTP (sync, SSE, outgoing mutations) stays inside the worker.
 *
 * Mutations are queued to IDB (`pendingMutations`) before hitting the
 * network; the queue is drained on a 30 s tick instead of per-mutation
 * so bursts of optimistic writes coalesce into one round-trip. Prompt
 * flushes cover startup, online, and pagehide so nothing strands on
 * reconnect or tab close. GETs bypass the queue.
 */

import { openDb, STORES, tx } from './localDb.js';
import { emitMutation } from './events.js';

const TICK_MS = 30_000;

let activeWorker = null;
let nextRpcId = 1;
const pending = new Map();
let dirty = false;

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
    /* Emit before onStatus so useSync's pulse listener observes the
     * pre-update phase ('syncing') and doesn't flash on completion. */
    if (data.type === 'done' || data.type === 'change') emitMutation();
    if (data.type === 'done') flushNow();
    onStatus(data);
  };
  worker.onerror = (e) => onStatus({ type: 'error', message: e.message });

  worker.postMessage({ type: 'sync-all',     serverUrl });
  worker.postMessage({ type: 'start-events', serverUrl });

  activeWorker = worker;
  /* Ship anything the previous session left queued as soon as we're connected. */
  dirty = true;
  flushNow();

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
 * Fire-and-resolve HTTP call that bypasses the offline queue entirely.
 * Use only when the caller requires the server's response right now and
 * the action can't be made useful offline (e.g. memory game setup needs
 * the server to sample images from the library). Rejects with
 * `{ status: 0 }` when offline.
 */
export const request = sendDirect;

/**
 * Queue a mutation and mark the queue dirty. Returns `{ __queued: true }`
 * immediately — callers rely on optimistic IDB writes for UI and the
 * drain's `then` refetch or SSE resync for authoritative reconciliation.
 *
 * The server push happens on the next 30 s tick (or sooner on online /
 * pagehide / sync-done). GETs bypass the queue and resolve with the
 * server's response.
 *
 * @param {object} req
 * @param {string} req.method — 'GET'|'POST'|'PATCH'|'DELETE'
 * @param {string} req.path
 * @param {*}      [req.body]
 * @param {{ method:string, path:string, store:string }} [req.then] —
 *   optional follow-up GET whose response is written to `store` after
 *   the main request succeeds. Presence of `then` also forces an
 *   immediate drain (caller needs the refetched state now).
 * @param {boolean} [req.flush] — force immediate drain without a refetch.
 *   Use for actions that require server-side work the player is waiting
 *   on (e.g. forming a quest deck) but don't care about a specific reply.
 * @param {{ store:string, key:any }} [req.deleteOptimistic] — IDB row
 *   to delete once the POST succeeds. Closes the gap where both the
 *   optimistic (negative temp id) row and the server-assigned real row
 *   could be visible at the same time (LAW 1.38).
 */
export async function mutate({ method, path, body, then, flush, deleteOptimistic }) {
  if (method === 'GET') return sendDirect({ method, path });
  console.debug('[mutate] queueing', method, path);
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const t = db.transaction(STORES.PENDING_MUTATIONS, 'readwrite');
    t.oncomplete = resolve;
    t.onerror    = () => reject(t.error);
    t.objectStore(STORES.PENDING_MUTATIONS).add({ method, path, body, then, deleteOptimistic, createdAt: Date.now() });
  });
  dirty = true;
  console.debug('[mutate] queued, dirty=true');
  if (then || flush) flushNow();
  return { __queued: true };
}

/* ── Queue drain ─────────────────────────────────────────────────── */

let draining = false;

/**
 * Flush dirty mutations now. Safe to call concurrently — `drainQueue`
 * guards against overlapping drains, and re-marking `dirty` during a
 * drain is picked up by the next tick.
 */
function flushNow() {
  if (!dirty) return;
  console.debug('[flushNow] draining');
  dirty = false;
  drainQueue();
}

export async function drainQueue() {
  if (draining || !activeWorker) return;
  draining = true;
  let drained = 0;
  try {
    while (activeWorker) {
      const head = await peekHead();
      if (!head) break;
      try {
        await sendDirect({ method: head.method, path: head.path, body: head.body });
        if (head.deleteOptimistic) {
          /* Wipe the placeholder row in the same event loop pass as the
           * successful POST so the user can't glimpse both it and the
           * server-assigned row side-by-side (LAW 1.38). */
          await tx(head.deleteOptimistic.store, 'readwrite', (t) => {
            t.objectStore(head.deleteOptimistic.store).delete(head.deleteOptimistic.key);
          });
        }
        if (head.then) {
          const fresh = await sendDirect({ method: head.then.method, path: head.then.path });
          if (fresh) await putIntoStore(head.then.store, fresh);
        }
        await deleteHead(head.id);
        drained++;
      } catch (err) {
        if (err.status === 0) break; /* network — retry on next online */
        await deleteHead(head.id);   /* 4xx/5xx — can't retry, drop */
        drained++;
        console.warn(`mutation ${head.method} ${head.path} dropped:`, err.message);
      }
    }
  } finally {
    draining = false;
    emitMutation();
    /* Snapshot syncs skip while the queue is non-empty — now that it's
     * empty (or we bailed on network) kick a fresh sync so server truth
     * converges with whatever just drained. */
    if (drained > 0 && activeWorker) activeWorker.postMessage({ type: 'sync-all' });
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

setInterval(flushNow, TICK_MS);

if (typeof window !== 'undefined') {
  window.addEventListener('online',   () => { dirty = true; flushNow(); });
  window.addEventListener('pagehide', () => { dirty = true; flushNow(); });
}
