/**
 * @file Main-thread bridge to the sync Web Worker.
 *
 * Exports the same `syncAll` / `drainMutationQueue` API the rest of the
 * app expects, but all heavy lifting (fetch, JSON parse, IDB writes)
 * runs off-thread. The worker posts `stores-updated` messages back;
 * we call `notify()` so React hooks re-read from IDB.
 */

import { notify } from './localDb.js';
import { showToast } from '../components/ToasterMessage.jsx';

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

export function drainMutationQueue() {
  worker.postMessage({ type: 'drain-queue' });
}
