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

    /* Count direct media per folder, split by type. */
    const countStmt = db.prepare(
      'SELECT folder, type, COUNT(*) as count FROM media WHERE hidden = 0 GROUP BY folder, type'
    );
    const imageCounts = new Map();
    const videoCounts = new Map();
    while (countStmt.step()) {
      const row = countStmt.getAsObject();
      if (row.type === 'image') {
        imageCounts.set(row.folder, (imageCounts.get(row.folder) || 0) + row.count);
      } else {
        videoCounts.set(row.folder, (videoCounts.get(row.folder) || 0) + row.count);
      }
    }
    countStmt.free();

    /* Get one preview media ID per folder (first image, or first video if no images). */
    const previewStmt = db.prepare(
      `SELECT folder, id FROM media WHERE hidden = 0
       ORDER BY CASE WHEN type = 'image' THEN 0 ELSE 1 END, created_at DESC`
    );
    const previewIds = new Map();
    while (previewStmt.step()) {
      const row = previewStmt.getAsObject();
      if (!previewIds.has(row.folder)) {
        previewIds.set(row.folder, row.id);
      }
    }
    previewStmt.free();

    /* Compute parentId and counts for each folder. */
    const result = folders.map(f => ({
      id: f.id,
      path: f.path,
      parentId: pathToId.get(path.dirname(f.path)) || null,
      mediaCount: (imageCounts.get(f.path) || 0) + (videoCounts.get(f.path) || 0),
      imageCount: imageCounts.get(f.path) || 0,
      videoCount: videoCounts.get(f.path) || 0,
      previewMediaId: previewIds.get(f.path) || null,
    }));

    /* Compute subtree totals bottom-up (children before parents). */
    const idMap = new Map(result.map(f => [f.id, f]));
    for (const f of result) {
      f.subtreeMediaCount = f.mediaCount;
      f.subtreeImageCount = f.imageCount;
      f.subtreeVideoCount = f.videoCount;
    }
    /* Propagate counts upward. Process in reverse path-length order (deepest first). */
    const sorted = [...result].sort((a, b) => b.path.length - a.path.length);
    for (const f of sorted) {
      if (f.parentId && idMap.has(f.parentId)) {
        const parent = idMap.get(f.parentId);
        parent.subtreeMediaCount += f.subtreeMediaCount;
        parent.subtreeImageCount += f.subtreeImageCount;
        parent.subtreeVideoCount += f.subtreeVideoCount;
        if (!parent.previewMediaId && f.previewMediaId) {
          parent.previewMediaId = f.previewMediaId;
        }
      }
    }

    /* Filter out folders with no media in their subtree. */
    const filtered = result.filter(f => f.subtreeMediaCount > 0);

    json(res, 200, filtered);
  });
};
