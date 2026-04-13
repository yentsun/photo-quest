/**
 * @file Main-thread bridge to the sync Web Worker.
 *
 * `startSync(serverUrl, onStatus)` spawns the worker, kicks off a full
 * sync, and routes progress/done/error messages back through `onStatus`.
 * Returns a `stop()` handle that terminates the worker.
 */

export function startSync(serverUrl, onStatus) {
  const worker = new Worker(
    new URL('./syncWorker.js', import.meta.url),
    { type: 'module' },
  );

  worker.onmessage = ({ data }) => onStatus(data);
  worker.onerror = (e) => onStatus({ type: 'error', message: e.message });

  worker.postMessage({ type: 'sync-all', serverUrl });

  return () => worker.terminate();
}
