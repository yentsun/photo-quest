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

    const folder = db.prepare('SELECT id, path, name, thumbnail_media_id FROM folders WHERE id = ?').get(folderId);
    if (!folder) {
      return json(res, 404, { error: 'Folder not found' });
    }

    const { name, thumbnailMediaId } = body;
    const updates = [];
    const values = [];

    if (name !== undefined) {
      const cleanName = name != null ? String(name).trim() || null : null;
      updates.push('name = ?');
      values.push(cleanName);
    }

    if (thumbnailMediaId !== undefined) {
      const thumbnailId = thumbnailMediaId != null ? Number(thumbnailMediaId) : null;
      if (thumbnailId != null) {
        const media = kojo.ops.getMediaById(thumbnailId);
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
      values.push(thumbnailId);
    }

    if (updates.length === 0) {
      return json(res, 400, { error: 'No fields provided' });
    }

    values.push(folderId);
    const result = db.prepare(
      `UPDATE folders SET ${updates.join(', ')} WHERE id = ? RETURNING id, path, name, thumbnail_media_id`
    ).get(...values);

    logger.debug(`[PATCH /folders/:id] updated id=${folderId} fields=[${updates.join(', ')}]`);
    json(res, 200, {
      id: result.id,
      path: result.path,
      name: result.name,
      thumbnailMediaId: result.thumbnail_media_id,
    });
  });
};
