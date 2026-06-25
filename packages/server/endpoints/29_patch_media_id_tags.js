/**
 * @file PATCH /media/:id/tags -- Update the tags for a media item.
 */

import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'PATCH',
    pathname: '/media/:id/tags',
  }, async (req, res, params) => {
    logger.debug(`[PATCH /media/:id/tags] id=${params.id}`);
    let body = '';
    for await (const chunk of req) body += chunk;

    let tags;
    try {
      ({ tags } = JSON.parse(body));
    } catch {
      logger.debug(`[PATCH /media/:id/tags] invalid JSON body`);
      return json(res, 400, { error: 'Invalid JSON' });
    }

    if (!Array.isArray(tags)) {
      logger.debug(`[PATCH /media/:id/tags] tags not an array`);
      return json(res, 400, { error: 'tags must be an array' });
    }

    const sanitized = tags.map(t => String(t).trim()).filter(Boolean);
    logger.debug(`[PATCH /media/:id/tags] sanitized tags=${JSON.stringify(sanitized)}`);
    const result = kojo.ops.updateTags(Number(params.id), sanitized);

    if (!result) {
      logger.debug(`[PATCH /media/:id/tags] not found: id=${params.id}`);
      return json(res, 404, { error: 'Media not found' });
    }

    logger.debug(`[PATCH /media/:id/tags] updated: id=${params.id}`);
    json(res, 200, result);
  });
};
