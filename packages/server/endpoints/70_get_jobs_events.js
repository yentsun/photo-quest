/**
 * @file GET /jobs/events -- Server-Sent Events stream for real-time job updates.
 *
 * Kojo endpoint: registers route via the addHttpRoute op.
 *
 * Opens a long-lived HTTP connection that the browser reads via the
 * EventSource API. The server pushes JSON-encoded event data whenever
 * a job's status changes (started, progress, completed, failed).
 *
 * The connection stays open until the client disconnects. On disconnect
 * we remove the response object from the SSE client set so we stop
 * writing to a dead socket.
 */

import { addSseClient, removeSseClient } from '../src/sse.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'GET',
    pathname: '/jobs/events',
  }, (req, res) => {
    /* SSE-required headers. */
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    /* Register this connection so broadcastSse() can push to it. */
    addSseClient(res);

    /* Clean up when the client disconnects (browser tab closed, etc). */
    req.on('close', () => {
      removeSseClient(res);
    });
  });
};
