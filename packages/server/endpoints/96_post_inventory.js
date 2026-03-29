/**
 * @file POST /inventory -- Add a media item to the player's inventory.
 *
 * Kojo endpoint: registers route via the addHttpRoute op.
 * Delegates to `kojo.ops.addToInventory(mediaId)`.
 *
 * Body: { mediaId: number }
 * Returns 201 if newly added, 200 if already in inventory, 404 if media not found.
 */

import { json } from '../src/http.js';
import { parseBody } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'POST',
    pathname: '/inventory',
  }, async (req, res) => {
    const body = await parseBody(req);
    const mediaId = Number(body.mediaId);

    if (!Number.isFinite(mediaId) || mediaId <= 0) {
      return json(res, 400, { error: 'mediaId must be a positive number' });
    }

    const result = kojo.ops.addToInventory(mediaId);

    if (!result) {
      return json(res, 404, { error: 'Media not found' });
    }

    json(res, result.added ? 201 : 200, result.item);
  });
};
