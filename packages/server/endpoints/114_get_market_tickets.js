/**
 * @file GET /market/tickets -- Get unused memory ticket count.
 */

import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'GET',
    pathname: '/market/tickets',
  }, (req, res) => {
    const result = kojo.ops.getMemoryTickets();
    json(res, 200, result);
  });
};
