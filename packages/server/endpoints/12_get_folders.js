/**
 * @file GET /folders -- Return folder records with hierarchy metadata.
 *
 * Kojo endpoint: registers route via the addHttpRoute op.
 * Returns folders with computed parentId (from path relationships),
 * direct mediaCount, and total subtree media count.
 * Excludes folders with zero media in their entire subtree.
 *
 * Query params:
 *   ?parent=<id>  Scoped: return ancestors, target, and direct children.
 *                 Used by FolderPage for breadcrumbs and subfolder display.
 */

import path from 'node:path';
import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'GET',
    pathname: '/folders',
  }, (req, res) => {
    const db = kojo.get('db');
    const url = new URL(req.url, `http://${req.headers.host}`);
    const parentId = url.searchParams.get('parent');

    /* Scoped query: /folders?parent=<id> */
    if (parentId) {
      const target = db.prepare('SELECT id, path, name FROM folders WHERE id = ?').get(parentId);
      if (!target) {
        json(res, 404, { error: 'Folder not found' });
        return;
      }

      logger.debug(`[GET /folders] scoped: parent=${parentId} path=${target.path}`);

      const targetPath = target.path;
      const sep = path.sep;

      /* Walk up ancestors for breadcrumbs. */
      const ancestors = [];
      let currentPath = targetPath;
      while (true) {
        const parentPath = path.dirname(currentPath);
        if (parentPath === currentPath) break;
        const ancestor = db.prepare('SELECT id, path, name FROM folders WHERE path = ?').get(parentPath);
        if (!ancestor) break;
        ancestors.unshift(ancestor);
        currentPath = parentPath;
      }

      /* Get all descendant folders (including target). */
      const likePattern = targetPath + sep + '%';
      const descendants = db.prepare(
        'SELECT id, path, name FROM folders WHERE path = ? OR path LIKE ?'
      ).all(targetPath, likePattern);
      logger.debug(`[GET /folders] scoped: ${descendants.length} descendants`);

      /* Build path→id map for parent lookup. */
      const pathToId = new Map(descendants.map(f => [f.path, f.id]));
      for (const a of ancestors) pathToId.set(a.path, a.id);

      /* Direct media counts for descendant folders (path prefix matching). */
      const typeCounts = db.prepare(
        'SELECT folder, type, COUNT(*) as count FROM media WHERE hidden = 0 AND (folder = ? OR folder LIKE ?) GROUP BY folder, type'
      ).all(targetPath, likePattern);
      const imageCounts = new Map();
      const videoCounts = new Map();
      for (const row of typeCounts) {
        if (row.type === 'image') {
          imageCounts.set(row.folder, (imageCounts.get(row.folder) || 0) + row.count);
        } else {
          videoCounts.set(row.folder, (videoCounts.get(row.folder) || 0) + row.count);
        }
      }

      /* Preview media IDs for descendant folders (path prefix matching). */
      const previews = db.prepare(
        `SELECT folder, id FROM media WHERE hidden = 0 AND (folder = ? OR folder LIKE ?)
         ORDER BY
           CASE WHEN LOWER(title) LIKE '%cover%' THEN 0 ELSE 1 END,
           title ASC`
      ).all(targetPath, likePattern);
      const previewIds = new Map();
      for (const row of previews) {
        if (!previewIds.has(row.folder)) {
          previewIds.set(row.folder, row.id);
        }
      }

      /* Build result for descendants (exclude ancestors, they'll be prepended). */
      const ancestorPaths = new Set(ancestors.map(a => a.path));
      const result = descendants.map(f => ({
        id: f.id,
        path: f.path,
        name: f.name || null,
        parentId: pathToId.get(path.dirname(f.path)) || null,
        mediaCount: (imageCounts.get(f.path) || 0) + (videoCounts.get(f.path) || 0),
        imageCount: imageCounts.get(f.path) || 0,
        videoCount: videoCounts.get(f.path) || 0,
        previewMediaId: previewIds.get(f.path) || null,
      }));

      /* Compute subtree totals bottom-up. */
      const idMap = new Map(result.map(f => [f.id, f]));
      for (const f of result) {
        f.subtreeMediaCount = f.mediaCount;
        f.subtreeImageCount = f.imageCount;
        f.subtreeVideoCount = f.videoCount;
      }
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

      /* Build final output: ancestors + target + children. */
      const targetId = Number(parentId);
      const children = result.filter(f => f.parentId === targetId);
      const targetFolder = result.find(f => f.id === targetId);

      /* Only prepend ancestors that aren't already in the result. */
      const ancestorResults = ancestors
        .filter(a => !ancestorPaths.has(a.path) || a.id === targetId)
        .map(a => {
          const existing = result.find(f => f.id === a.id);
          if (existing) return existing;
          return {
            id: a.id,
            path: a.path,
            name: a.name || null,
            parentId: pathToId.get(path.dirname(a.path)) || null,
            mediaCount: 0,
            imageCount: 0,
            videoCount: 0,
            previewMediaId: null,
            subtreeMediaCount: 0,
            subtreeImageCount: 0,
            subtreeVideoCount: 0,
          };
        });

      /* Ancestors must survive the subtree filter; borrow the target's count. */
      const targetSubtree = targetFolder ? targetFolder.subtreeMediaCount : 0;
      const ancestorIds = new Set(ancestors.map(a => a.id));
      for (const a of ancestorResults) {
        if (a.subtreeMediaCount === 0 && ancestorIds.has(a.id)) {
          a.subtreeMediaCount = targetSubtree;
          a.subtreeImageCount = targetFolder ? targetFolder.subtreeImageCount : 0;
          a.subtreeVideoCount = targetFolder ? targetFolder.subtreeVideoCount : 0;
        }
      }

      /* Deduplicate: merge ancestors + result (ancestors may already be in result). */
      const seen = new Set();
      const output = [];
      for (const f of ancestorResults) { if (!seen.has(f.id)) { seen.add(f.id); output.push(f); } }
      if (targetFolder && !seen.has(targetFolder.id)) { seen.add(targetFolder.id); output.push(targetFolder); }
      for (const f of children) { if (!seen.has(f.id)) { seen.add(f.id); output.push(f); } }

      const filtered = output.filter(f => f.subtreeMediaCount > 0);
      logger.debug(`[GET /folders] scoped: returning ${filtered.length} folders`);

      json(res, 200, filtered);
      return;
    }

    /* Full query: /folders (no parent filter) */
    logger.debug(`[GET /folders] querying folders`);
    const folders = db.prepare('SELECT id, path, name FROM folders ORDER BY path').all();
    logger.debug(`[GET /folders] raw folder count: ${folders.length}`);

    /* Build path→id map for parent lookup. */
    const pathToId = new Map(folders.map(f => [f.path, f.id]));

    /* Count direct media per folder, split by type. */
    const typeCounts = db.prepare(
      'SELECT folder, type, COUNT(*) as count FROM media WHERE hidden = 0 GROUP BY folder, type'
    ).all();
    const imageCounts = new Map();
    const videoCounts = new Map();
    for (const row of typeCounts) {
      if (row.type === 'image') {
        imageCounts.set(row.folder, (imageCounts.get(row.folder) || 0) + row.count);
      } else {
        videoCounts.set(row.folder, (videoCounts.get(row.folder) || 0) + row.count);
      }
    }

    /* Get one preview media ID per folder — cover item wins, then first by name. */
    const previews = db.prepare(
      `SELECT folder, id FROM media WHERE hidden = 0
       ORDER BY
         CASE WHEN LOWER(title) LIKE '%cover%' THEN 0 ELSE 1 END,
         title ASC`
    ).all();
    const previewIds = new Map();
    for (const row of previews) {
      if (!previewIds.has(row.folder)) {
        previewIds.set(row.folder, row.id);
      }
    }

    /* Compute parentId and counts for each folder. */
    const result = folders.map(f => ({
      id: f.id,
      path: f.path,
      name: f.name || null,
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

    const filtered = result.filter(f => f.subtreeMediaCount > 0);
    logger.debug(`[GET /folders] filtered to ${filtered.length} folders with media`);

    json(res, 200, filtered);
  });
};
