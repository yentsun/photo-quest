/**
 * @file POST /market/use-ticket -- Use a memory game ticket.
 */

import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'POST',
    pathname: '/market/use-ticket',
  }, (req, res) => {
    const result = kojo.ops.useMemoryTicket();

    if (!result) {
      return json(res, 400, { error: 'No tickets available' });
    }

    json(res, 200, result);
  });
};
