/**
 * @file GET /folders -- Return all folder records with hierarchy metadata.
 *
 * Kojo endpoint: registers route via the addHttpRoute op.
 * Returns folders with computed parentId (from path relationships),
 * direct mediaCount, and total subtree media count.
 * Excludes folders with zero media in their entire subtree.
 */

import path from 'node:path';
import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'GET',
    pathname: '/folders',
  }, (req, res) => {
    const db = kojo.get('db');

    /* Fetch all folders. */
    const stmt = db.prepare('SELECT id, path FROM folders ORDER BY path');
    const folders = [];
    while (stmt.step()) {
      folders.push(stmt.getAsObject());
    }
    stmt.free();

    /* Build path→id map for parent lookup. */
    const pathToId = new Map(folders.map(f => [f.path, f.id]));

    /* Count direct media per folder. */
    const countStmt = db.prepare(
      'SELECT folder, COUNT(*) as count FROM media WHERE hidden = 0 GROUP BY folder'
    );
    const mediaCounts = new Map();
    while (countStmt.step()) {
      const row = countStmt.getAsObject();
      mediaCounts.set(row.folder, row.count);
    }
    countStmt.free();

    /* Compute parentId and mediaCount for each folder. */
    const result = folders.map(f => ({
      id: f.id,
      path: f.path,
      parentId: pathToId.get(path.dirname(f.path)) || null,
      mediaCount: mediaCounts.get(f.path) || 0,
    }));

    /* Compute subtreeMediaCount bottom-up (children before parents). */
    const idMap = new Map(result.map(f => [f.id, f]));
    for (const f of result) {
      f.subtreeMediaCount = f.mediaCount;
    }
    /* Propagate counts upward. Process in reverse path-length order (deepest first). */
    const sorted = [...result].sort((a, b) => b.path.length - a.path.length);
    for (const f of sorted) {
      if (f.parentId && idMap.has(f.parentId)) {
        idMap.get(f.parentId).subtreeMediaCount += f.subtreeMediaCount;
      }
    }

    /* Filter out folders with no media in their subtree. */
    const filtered = result.filter(f => f.subtreeMediaCount > 0);

    json(res, 200, filtered);
  });
};
