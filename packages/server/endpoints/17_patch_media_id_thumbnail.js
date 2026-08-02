/**
 * @file PATCH /media/:id/thumbnail -- Set a custom thumbnail frame for a video.
 */

import { json, parseBody } from '../src/http.js';
import { MEDIA_TYPE } from '@photo-quest/shared';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'PATCH',
    pathname: '/media/:id/thumbnail',
  }, async (req, res, params) => {
    logger.debug(`[PATCH /media/:id/thumbnail] id=${params.id}`);

    let body;
    try {
      body = await parseBody(req) || {};
    } catch (err) {
      return json(res, 400, { error: 'Invalid JSON' });
    }

    const { thumbnailTime } = body;
    const time = thumbnailTime != null ? Number(thumbnailTime) : null;
    if (time == null || !Number.isFinite(time) || time < 0) {
      return json(res, 400, { error: 'Invalid thumbnail time' });
    }

    const db = kojo.get('db');
    const mediaId = Number(params.id);

    const media = kojo.ops.getMediaById(mediaId);
    if (!media) {
      return json(res, 404, { error: 'Media not found' });
    }
    if (media.type !== MEDIA_TYPE.VIDEO) {
      return json(res, 400, { error: 'Thumbnail time can only be set for video media' });
    }

    const result = db.prepare(
      'UPDATE media SET thumbnail_time = ?, updated_at = datetime(\'now\') WHERE id = ? RETURNING *'
    ).get(time, mediaId);

    logger.debug(`[PATCH /media/:id/thumbnail] set time=${time} for id=${mediaId}`);
    json(res, 200, result);
  });
};
