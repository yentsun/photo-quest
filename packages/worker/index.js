/**
 * @file Worker process entry point -- the background job processor.
 *
 * The worker runs as a separate Node.js process alongside the HTTP server.
 * It continuously polls the SQLite database for pending jobs (probe and
 * transcode tasks) and processes them one at a time.
 *
 * Polling strategy:
 *  - After processing a job, immediately check for another one (via
 *    `setImmediate`) to drain the queue as fast as possible when there is
 *    a backlog (e.g. after a large directory scan).
 *  - When the queue is empty, wait POLL_INTERVAL ms before checking again
 *    to avoid busy-waiting and wasting CPU.
 *  - If processing throws an unexpected error, log it and fall back to the
 *    POLL_INTERVAL delay (rather than crashing the whole worker).
 *
 * Why a separate process instead of running jobs inside the server?
 *  - Transcoding is CPU-intensive and long-running.  Doing it in the server
 *    process would block the event loop and make the API unresponsive.
 *  - A separate process can be restarted independently without dropping
 *    active HTTP connections.
 */

import { initDb } from './src/queue.js';
import { processNextJob } from './src/pipeline.js';

/**
 * Milliseconds to wait between polls when the job queue is empty.
 * Can be overridden via the POLL_INTERVAL environment variable for tuning.
 *
 * @type {number}
 */
const POLL_INTERVAL = process.env.POLL_INTERVAL || 3000;

/* Ensure the database tables exist.  initDb() is async because sql.js
 * needs to load its WASM binary before we can use the database. */
console.debug('[worker] Initialising database...');
await initDb();

console.log('[worker] Started, polling for jobs...');

/**
 * Main polling loop.  Calls itself recursively via setImmediate (fast path)
 * or setTimeout (idle path).
 *
 * This is intentionally not an interval timer -- we want back-to-back
 * execution when there is work to do, and we want to avoid overlapping
 * invocations that could cause two jobs to run simultaneously.
 */
async function poll() {
  try {
    const processed = await processNextJob();

    /* If we just finished a job, check for the next one immediately.
     * setImmediate yields to the event loop (allowing I/O callbacks to fire)
     * but does not introduce any artificial delay. */
    if (processed) {
      setImmediate(poll);
      return;
    }
  } catch (err) {
    /* Log and continue rather than crashing.  The failing job has already
     * been marked as FAILED inside processNextJob's own catch block, so
     * this catch handles truly unexpected errors (e.g. DB connection lost). */
    console.error('[worker] Poll error:', err);
  }

  /* Queue is empty or an error occurred -- wait before polling again. */
  setTimeout(poll, POLL_INTERVAL);
}

/* Kick off the first poll. */
poll();
