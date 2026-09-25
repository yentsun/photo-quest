/**
 * @file PATCH /media/:id/effect -- Set or clear the animated doodle effect.
 *
 * Body: { effectConfig: { type, center: { x, y }, radius, count } | null }
 */

import { json, parseBody } from '../src/http.js';
import { normalizeEffectConfig } from '@photo-quest/shared';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'PATCH',
    pathname: '/media/:id/effect',
  }, async (req, res, params) => {
    logger.debug(`[PATCH /media/:id/effect] id=${params.id}`);

    let body;
    try {
      body = await parseBody(req) || {};
    } catch {
      logger.debug(`[PATCH /media/:id/effect] invalid JSON body`);
      return json(res, 400, { error: 'Invalid JSON' });
    }

    const { effectConfig } = body;
    const normalized = normalizeEffectConfig(effectConfig);
    if (normalized === undefined) {
      logger.debug(`[PATCH /media/:id/effect] invalid effect config`);
      return json(res, 400, { error: 'Invalid effect config' });
    }

    const result = kojo.ops.updateEffect(Number(params.id), normalized);

    if (!result) {
      logger.debug(`[PATCH /media/:id/effect] not found: id=${params.id}`);
      return json(res, 404, { error: 'Media not found' });
    }

    logger.debug(`[PATCH /media/:id/effect] updated: id=${params.id}`);
    json(res, 200, result);
  });
};
