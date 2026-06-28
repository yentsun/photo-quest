/**
 * @file PATCH /folders/:id -- Rename a folder (custom display name, DB only).
 */

import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'PATCH',
    pathname: '/folders/:id',
  }, async (req, res, params) => {
    logger.debug(`[PATCH /folders/:id] id=${params.id}`);
    let body = '';
    for await (const chunk of req) body += chunk;
    const { name } = JSON.parse(body);

    const db = kojo.get('db');
    const cleanName = name != null ? String(name).trim() || null : null;

    const result = db.prepare(
      'UPDATE folders SET name = ? WHERE id = ? RETURNING id, path, name'
    ).get(cleanName, Number(params.id));

    if (!result) return json(res, 404, { error: 'Folder not found' });
    logger.debug(`[PATCH /folders/:id] renamed id=${params.id} to "${cleanName}"`);
    json(res, 200, result);
  });
};
