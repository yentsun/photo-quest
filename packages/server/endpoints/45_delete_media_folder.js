/**
 * @file DELETE /media/folder/:name -- Remove a folder from the library.
 *
 * Kojo endpoint: registers route via the addHttpRoute op.
 *
 * Marks all media from the specified folder as hidden (hidden=1).
 * Records are preserved so likes and metadata can be restored if the
 * folder is re-added later.
 */

import { json } from '../src/http.js';
import { saveDb } from '../src/db.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'DELETE',
    pathname: '/media/folder/:name',
  }, (req, res, params) => {
    const folderName = decodeURIComponent(params.name);
    const db = kojo.get('db');

    // Hide all media from this folder
    db.run(
      'UPDATE media SET hidden = 1, updated_at = datetime("now") WHERE folder = ?',
      [folderName]
    );

    // Get count of affected rows
    const stmt = db.prepare('SELECT changes() as count');
    stmt.step();
    const { count } = stmt.getAsObject();
    stmt.free();

    saveDb();

    logger.info(`Removed folder "${folderName}" (${count} items hidden)`);

    return json(res, 200, {
      folder: folderName,
      hidden: count,
    });
  });
};
