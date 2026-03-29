/**
 * @file GET /piles -- List all piles with card counts.
 */

import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'GET',
    pathname: '/piles',
  }, (req, res) => {
    json(res, 200, kojo.ops.listPiles());
  });
};
