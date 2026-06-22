/**
 * @file GET /tags -- List all tags with usage counts.
 */

import { json } from '../src/http.js';

export default async (kojo) => {
  kojo.ops.addHttpRoute({
    method: 'GET',
    pathname: '/tags',
  }, (req, res) => {
    const tags = kojo.ops.listTags();
    json(res, 200, tags);
  });
};
