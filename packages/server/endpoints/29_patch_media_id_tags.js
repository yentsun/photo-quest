/**
 * @file PATCH /media/:id/tags -- Update the tags for a media item.
 */

import { json } from '../src/http.js';

export default async (kojo) => {
  kojo.ops.addHttpRoute({
    method: 'PATCH',
    pathname: '/media/:id/tags',
  }, async (req, res, params) => {
    let body = '';
    for await (const chunk of req) body += chunk;

    let tags;
    try {
      ({ tags } = JSON.parse(body));
    } catch {
      return json(res, 400, { error: 'Invalid JSON' });
    }

    if (!Array.isArray(tags)) {
      return json(res, 400, { error: 'tags must be an array' });
    }

    const sanitized = tags.map(t => String(t).trim()).filter(Boolean);
    const result = kojo.ops.updateTags(Number(params.id), sanitized);

    if (!result) {
      return json(res, 404, { error: 'Media not found' });
    }

    json(res, 200, result);
  });
};
