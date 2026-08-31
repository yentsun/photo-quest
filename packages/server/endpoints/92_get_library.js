/**
 * @file GET /library -- Report the currently connected library database.
 *
 * Surfaces the active DB path (and a short name) so the UI can show exactly
 * which library the app is serving. This is how a user can tell they opened
 * the wrong database and switch away from it.
 */

import path from 'node:path';
import { json } from '../src/http.js';
import { DB_PATH } from '../src/db.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'GET',
    pathname: '/library',
  }, (req, res) => {
    const dbPath = DB_PATH;
    const name = path.basename(dbPath);
    const dir = path.dirname(dbPath);

    let items = null;
    try {
      items = kojo.get('db').prepare('SELECT COUNT(*) AS n FROM media WHERE hidden = 0').get().n;
    } catch { /* db may not expose a count; leave items null */ }

    json(res, 200, { path: dbPath, name, dir, items });
  });
};
