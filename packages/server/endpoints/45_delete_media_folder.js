/**
 * @file DELETE /media/folder/:id -- Remove a folder from the library.
 *
 * Kojo endpoint: registers route via the addHttpRoute op.
 *
 * Looks up the folder path by ID, then marks all media from that folder
 * as hidden (hidden=1). Records are preserved so likes and metadata can
 * be restored if the folder is re-added later.
 */

import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'DELETE',
    pathname: '/media/folder/:id',
  }, (req, res, params) => {
    const folderId = Number(params.id);
    const db = kojo.get('db');

    /* Look up the folder path. */
    const folder = db.prepare('SELECT path FROM folders WHERE id = ?').get(folderId);

    if (!folder) {
      return json(res, 404, { error: 'Folder not found' });
    }

    /* Hide all media from this folder. */
    const result = db.prepare(
      "UPDATE media SET hidden = 1, updated_at = datetime('now') WHERE folder = ?"
    ).run(folder.path);

    logger.info(`Removed folder "${folder.path}" (${result.changes} items hidden)`);

    return json(res, 200, {
      folder: folder.path,
      hidden: result.changes,
    });
  });
};
