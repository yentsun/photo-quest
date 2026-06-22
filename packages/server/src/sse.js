/**
 * @file Server-Sent Events (SSE) client management.
 *
 * SSE is a one-way push channel from the server to the browser.  The client
 * opens a long-lived GET request to `/api/jobs/events`; the server holds that
 * connection open and writes event data whenever something interesting happens
 * (e.g. a job completes, progress updates).
 *
 * This module maintains a Set of currently-connected response objects and
 * provides functions to add, remove, and broadcast to them.
 *
 * Why SSE instead of WebSockets?
 *  - SSE is simpler (plain HTTP, no upgrade handshake, auto-reconnect built
 *    into the browser's EventSource API).
 *  - We only need server-to-client push -- the client never sends data back
 *    over this channel.
 *  - SSE works through most proxies and load balancers without special config.
 */

/**
 * The set of currently-connected SSE client response objects.
 * Using a Set gives O(1) add/remove and prevents accidental duplicates.
 *
 * @type {Set<import('http').ServerResponse>}
 */
const clients = new Set();

/**
 * Register a new SSE client.  Called when a browser opens the
 * `/api/jobs/events` endpoint.
 *
 * @param {import('http').ServerResponse} res - The response object to keep
 *   alive for streaming events.
 */
export function addSseClient(res) {
  clients.add(res);
}

/**
 * Unregister an SSE client.  Called when the client disconnects (the
 * request's `close` event fires).
 *
 * @param {import('http').ServerResponse} res - The response object to remove.
 */
export function removeSseClient(res) {
  clients.delete(res);
}

/**
 * Broadcast an event to every connected SSE client.
 *
 * The event payload is serialised to JSON and wrapped in the SSE wire format:
 *   data: {"type":"job_completed","jobId":7}\n\n
 *
 * Two trailing newlines are required by the SSE spec to delimit messages.
 * If a client's connection has silently died the `res.write()` call will
 * fail, which eventually triggers the `close` event and cleans up via
 * `removeSseClient`.
 *
 * @param {Object} event - The event payload (must be JSON-serialisable).
 */
export function broadcastSse(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of clients) {
    client.write(data);
  }
}

/**
 * Destroy all open SSE connections.
 * Called during graceful shutdown so the HTTP server can fully close.
 */
export function destroyAllSseClients() {
  for (const client of clients) {
    client.end();
    client.destroy();
  }
  clients.clear();
}
