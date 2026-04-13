/**
 * @file Main-thread bridge to the sync Web Worker.
 *
 * `startSync(serverUrl, onStatus)` spawns the worker, runs an initial
 * full sync, and subscribes to the server's change stream so later
 * mutations trigger per-table resyncs. All HTTP (incl. the SSE
 * connection) stays inside the worker — the main thread never touches
 * the backend.
 *
 * Returns a `stop()` handle that closes the SSE stream and terminates
 * the worker.
 */

export function startSync(serverUrl, onStatus) {
  const worker = new Worker(
    new URL('./syncWorker.js', import.meta.url),
    { type: 'module' },
  );

  worker.onmessage = ({ data }) => onStatus(data);
  worker.onerror = (e) => onStatus({ type: 'error', message: e.message });

  worker.postMessage({ type: 'sync-all',     serverUrl });
  worker.postMessage({ type: 'start-events', serverUrl });

  return () => {
    worker.postMessage({ type: 'stop-events' });
    worker.terminate();
  };
}
