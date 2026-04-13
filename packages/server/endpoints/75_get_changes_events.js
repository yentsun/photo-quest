/**
 * @file GET /changes/events — SSE stream of table-invalidation events.
 *
 * Clients open a long-lived connection; the server pushes a JSON payload
 * on any mutation that changes inventory, decks, etc. Each event names
 * the affected table and its new monotonic version.
 */

import { addChangeClient, removeChangeClient } from '../src/changes.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'GET',
    pathname: '/changes/events',
  }, (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    addChangeClient(res);
    req.on('close', () => removeChangeClient(res));
  });
};
