/**
 * @file PATCH /media/:id/rename -- Rename a media item.
 *
 * Kojo endpoint: registers route via the addHttpRoute op.
 * Body: { title: string }
 */

import { json, parseBody } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'PATCH',
    pathname: '/media/:id/rename',
  }, async (req, res, params) => {
    const body = await parseBody(req);
    const title = body?.title?.trim();

    if (!title) {
      return json(res, 400, { error: 'Title is required' });
    }

    const result = kojo.ops.renameMedia(Number(params.id), title);

    if (!result) {
      return json(res, 404, { error: 'Media not found' });
    }

    kojo.ops.bumpVersion('inventory');
    kojo.ops.bumpVersion('decks');
    json(res, 200, result);
  });
};
