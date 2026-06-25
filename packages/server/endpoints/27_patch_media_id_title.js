/**
 * @file PATCH /media/:id/title -- Rename a media item.
 */

import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'PATCH',
    pathname: '/media/:id/title',
  }, async (req, res, params) => {
    logger.debug(`[PATCH /media/:id/title] id=${params.id}`);
    let body = '';
    for await (const chunk of req) body += chunk;
    const { title } = JSON.parse(body);

    if (!title || !String(title).trim()) {
      logger.debug(`[PATCH /media/:id/title] missing title`);
      return json(res, 400, { error: 'Title is required' });
    }

    logger.debug(`[PATCH /media/:id/title] renaming id=${params.id} to "${title}"`);
    const result = kojo.ops.renameMedia(Number(params.id), title);

    if (!result) {
      logger.debug(`[PATCH /media/:id/title] not found: id=${params.id}`);
      return json(res, 404, { error: 'Media not found' });
    }

    logger.debug(`[PATCH /media/:id/title] renamed: id=${params.id}`);
    json(res, 200, result);
  });
};
