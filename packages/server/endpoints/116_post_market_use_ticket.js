/**
 * @file POST /market/use-ticket -- Use a memory game ticket.
 *
 * Body (optional): { inventoryId: number } to consume a specific ticket.
 * If omitted, the oldest ticket is consumed.
 */

import { json, parseBody } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'POST',
    pathname: '/market/use-ticket',
  }, async (req, res) => {
    const body = await parseBody(req);
    const inventoryId = body?.inventoryId ? Number(body.inventoryId) : undefined;

    const result = kojo.ops.useMemoryTicket(inventoryId);

    if (!result) {
      return json(res, 400, { error: 'No tickets available' });
    }

    json(res, 200, result);
  });
};
