/**
 * @file POST /media/add -- Add media items from client-side folder scan.
 *
 * Kojo endpoint: registers route via the addHttpRoute op.
 * Expects JSON body: { folderId, folderName, files: [{name, path}] }
 */

import { json, parseBody } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'POST',
    pathname: '/media/add',
  }, async (req, res) => {
    const body = await parseBody(req);

    if (!body || !body.folderId || !body.folderName || !Array.isArray(body.files)) {
      return json(res, 400, {
        error: 'Missing required fields: folderId, folderName, files'
      });
    }

    try {
      const result = kojo.ops.addMedia(body.folderId, body.folderName, body.files);
      kojo.ops.bumpVersion('inventory');
      json(res, 200, result);
    } catch (err) {
      json(res, 500, { error: err.message });
    }
  });
};
