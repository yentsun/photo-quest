/**
 * @file Main-thread bridge to the sync Web Worker.
 * All HTTP (sync, SSE, outgoing mutations) stays inside the worker.
 */

let activeWorker = null;
let nextId = 1;
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

export function mutate({ method, path, body }) {
  if (!activeWorker) return Promise.reject(new Error('Not connected to server'));
  const id = nextId++;
  const p = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  activeWorker.postMessage({ type: 'mutate', id, method, path, body });
  return p;
}
