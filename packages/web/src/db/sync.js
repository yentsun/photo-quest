/**
 * @file Main-thread bridge to the sync Web Worker.
 *
 * Exports the same `syncAll` / `drainMutationQueue` API the rest of the
 * app expects, but all heavy lifting (fetch, JSON parse, IDB writes)
 * runs off-thread. The worker posts `stores-updated` messages back;
 * we call `notify()` so React hooks re-read from IDB.
 *
 * Mutation push is throttled: individual actions no longer push to the
 * server as they happen. Instead every `drainMutationQueue()` call just
 * marks the queue dirty, and a 30 s tick drains whatever has accumulated.
 * Prompt flushes still happen on startup, network reconnect, and tab
 * hide so mutations don't strand.
 */

import { notify } from './localDb.js';
import { showToast } from '../components/ToasterMessage.jsx';

const TICK_MS = 30_000;

const worker = new Worker(
  new URL('./syncWorker.js', import.meta.url),
  { type: 'module' },
);

worker.onmessage = ({ data }) => {
  switch (data.type) {
    case 'stores-updated':
      notify(data.stores);
      break;
    case 'toast':
      showToast(data.message, data.level);
      break;
  }
};

export function syncAll() {
  worker.postMessage({ type: 'sync-all' });
}

export function syncTable(table) {
  worker.postMessage({ type: 'sync-table', table });
}

let dirty = false;

function flushNow() {
  if (!dirty) return;
  dirty = false;
  worker.postMessage({ type: 'drain-queue' });
}

/**
 * Enqueued-mutation notifier. Action code calls this after each optimistic
 * txn commits; the actual server push happens on the next tick.
 */
export function drainMutationQueue() {
  dirty = true;
}

/* Tick drives the server push. Worker's drain is idempotent, so there's no
 * harm if `dirty` is set again mid-flight — the next tick will pick up
 * whatever arrived during the previous drain. */
setInterval(flushNow, TICK_MS);

/* Ship any rows the previous session left behind. Also marks dirty so the
 * first tick after load is productive even if nothing new happens. */
dirty = true;
flushNow();

/* Prompt flushes — don't make the user wait 30 s after coming back online,
 * and don't leave mutations in the queue when the tab is going away. */
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { dirty = true; flushNow(); });
  window.addEventListener('pagehide', () => { dirty = true; flushNow(); });
}
