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
import { saveDb } from '../src/db.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'DELETE',
    pathname: '/media/folder/:id',
  }, (req, res, params) => {
    const folderId = Number(params.id);
    const db = kojo.get('db');

    /* Look up the folder path. */
    const folderStmt = db.prepare('SELECT path FROM folders WHERE id = ?');
    folderStmt.bind([folderId]);
    const hasFolder = folderStmt.step();

    if (!hasFolder) {
      folderStmt.free();
      return json(res, 404, { error: 'Folder not found' });
    }

    const folderPath = folderStmt.getAsObject().path;
    folderStmt.free();

    /* Hide all media from this folder. */
    db.run(
      'UPDATE media SET hidden = 1, updated_at = datetime("now") WHERE folder = ?',
      [folderPath]
    );

    const stmt = db.prepare('SELECT changes() as count');
    stmt.step();
    const { count } = stmt.getAsObject();
    stmt.free();

    saveDb();

    logger.info(`Removed folder "${folderPath}" (${count} items hidden)`);

    return json(res, 200, {
      folder: folderPath,
      hidden: count,
    });
  });
};
