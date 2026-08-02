/**
 * @file PATCH /folders/:id -- Update a folder's display name and/or thumbnail.
 */

import { json, parseBody } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'PATCH',
    pathname: '/folders/:id',
  }, async (req, res, params) => {
    logger.debug(`[PATCH /folders/:id] id=${params.id}`);

    let body;
    try {
      body = await parseBody(req) || {};
    } catch (err) {
      return json(res, 400, { error: 'Invalid JSON' });
    }

    const db = kojo.get('db');
    const folderId = Number(params.id);

    const folder = db.prepare('SELECT id, path, name, thumbnail_media_id, thumbnail_time FROM folders WHERE id = ?').get(folderId);
    if (!folder) {
      return json(res, 404, { error: 'Folder not found' });
    }

    const { name, thumbnailMediaId, thumbnailTime } = body;
    const updates = [];
    const values = [];

    if (name !== undefined) {
      const cleanName = name != null ? String(name).trim() || null : null;
      updates.push('name = ?');
      values.push(cleanName);
    }

    let targetMediaId = folder.thumbnail_media_id;
    if (thumbnailMediaId !== undefined) {
      targetMediaId = thumbnailMediaId != null ? Number(thumbnailMediaId) : null;
    }

    if (thumbnailMediaId !== undefined) {
      if (targetMediaId != null) {
        const media = kojo.ops.getMediaById(targetMediaId);
        if (!media) {
          return json(res, 404, { error: 'Media not found' });
        }
        if (media.folder !== folder.path) {
          return json(res, 400, { error: 'Media does not belong to this folder' });
        }
        if (media.hidden) {
          return json(res, 400, { error: 'Media is hidden' });
        }
      }
      updates.push('thumbnail_media_id = ?');
      values.push(targetMediaId);
    }

    if (thumbnailTime !== undefined) {
      const time = thumbnailTime != null ? Number(thumbnailTime) : null;
      if (time != null) {
        if (!Number.isFinite(time) || time < 0) {
          return json(res, 400, { error: 'Invalid thumbnail time' });
        }
        const mediaId = thumbnailMediaId !== undefined ? targetMediaId : folder.thumbnail_media_id;
        if (mediaId == null) {
          return json(res, 400, { error: 'Thumbnail media is required when setting a time offset' });
        }
        const media = kojo.ops.getMediaById(mediaId);
        if (media.type !== 'video') {
          return json(res, 400, { error: 'Thumbnail time can only be set for video media' });
        }
      }
      updates.push('thumbnail_time = ?');
      values.push(time);
    }

    if (thumbnailMediaId !== undefined && targetMediaId == null && thumbnailTime === undefined) {
      /* Clearing the thumbnail should also clear any stored time offset. */
      updates.push('thumbnail_time = ?');
      values.push(null);
    }

    if (updates.length === 0) {
      return json(res, 400, { error: 'No fields provided' });
    }

    values.push(folderId);
    const result = db.prepare(
      `UPDATE folders SET ${updates.join(', ')} WHERE id = ? RETURNING id, path, name, thumbnail_media_id, thumbnail_time`
    ).get(...values);

    logger.debug(`[PATCH /folders/:id] updated id=${folderId} fields=[${updates.join(', ')}]`);
    json(res, 200, {
      id: result.id,
      path: result.path,
      name: result.name,
      thumbnailMediaId: result.thumbnail_media_id,
      thumbnailTime: result.thumbnail_time,
    });
  });
};
