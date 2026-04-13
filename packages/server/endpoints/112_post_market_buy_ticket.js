/**
 * @file POST /market/buy-ticket -- Buy a memory game ticket.
 */

import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'POST',
    pathname: '/market/buy-ticket',
  }, (req, res) => {
    const result = kojo.ops.buyMemoryTicket();

    if (!result) {
      return json(res, 400, { error: 'Insufficient magic dust' });
    }

    kojo.ops.bumpVersion('inventory');
    json(res, 201, result);
  });
};
