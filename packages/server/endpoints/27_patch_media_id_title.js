/**
 * @file PATCH /media/:id/title -- Rename a media item.
 */

import { json } from '../src/http.js';

export default async (kojo) => {
  kojo.ops.addHttpRoute({
    method: 'PATCH',
    pathname: '/media/:id/title',
  }, async (req, res, params) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const { title } = JSON.parse(body);

    if (!title || !String(title).trim()) {
      return json(res, 400, { error: 'Title is required' });
    }

    const result = kojo.ops.renameMedia(Number(params.id), title);

    if (!result) {
      return json(res, 404, { error: 'Media not found' });
    }

    json(res, 200, result);
  });
};
