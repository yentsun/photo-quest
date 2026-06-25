/**
 * @file GET /tags -- List all tags with usage counts.
 */

import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'GET',
    pathname: '/tags',
  }, (req, res) => {
    logger.debug(`[GET /tags] querying`);
    const tags = kojo.ops.listTags();
    logger.debug(`[GET /tags] → ${tags.length} tags`);
    json(res, 200, tags);
  });
};
