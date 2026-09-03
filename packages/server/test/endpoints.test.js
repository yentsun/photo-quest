/**
 * @file Integration tests for HTTP endpoints.
 *
 * Tests endpoint handlers directly with mock req/res objects.
 */

import test from 'node:test';
import { DatabaseSync as Database } from 'node:sqlite';
import { CREATE_MEDIA_TABLE, CREATE_JOBS_TABLE, CREATE_FOLDERS_TABLE } from '@photo-quest/shared';
import config from '@photo-quest/shared/config.js';

// Import endpoint handlers
import endpoint_get_media from '../endpoints/10_get_media.js';
import endpoint_get_media_id from '../endpoints/20_get_media_id.js';
import endpoint_get_duplicates from '../endpoints/93_get_duplicates.js';
import endpoint_post_duplicates_merge from '../endpoints/94_post_duplicates_merge.js';
import endpoint_patch_like from '../endpoints/25_patch_media_id_like.js';
import endpoint_post_scan from '../endpoints/30_post_media_scan.js';
import endpoint_post_add from '../endpoints/35_post_media_add.js';
import endpoint_delete from '../endpoints/40_delete_media_id.js';
import endpoint_delete_folder from '../endpoints/45_delete_media_folder.js';
import endpoint_patch_folder from '../endpoints/16_patch_folder_id.js';
import endpoint_patch_media_thumbnail from '../endpoints/17_patch_media_id_thumbnail.js';

let db;
let kojo;
let routes;

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

async function setup() {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(CREATE_MEDIA_TABLE);
  db.exec(CREATE_JOBS_TABLE);
  db.exec(CREATE_FOLDERS_TABLE);

  routes = [];

  kojo = {
    get: (key) => {
      if (key === 'db') return db;
      if (key === 'routes') return routes;
    },
    set: () => {},
    ops: {
      addHttpRoute: (config, handler) => {
        routes.push({ ...config, handler });
      },
      listMedia: function() {
        const { total } = db.prepare('SELECT COUNT(*) AS total FROM media').get();
        const items = db.prepare('SELECT * FROM media ORDER BY created_at DESC').all();
        return { items, total };
      },
      listDuplicates: function({ countOnly = false } = {}) {
        const rows = db.prepare(`
          SELECT * FROM media
          WHERE hidden = 0 AND hash IS NOT NULL AND hash != ''
            AND hash IN (
              SELECT hash FROM media WHERE hidden = 0 AND hash IS NOT NULL AND hash != ''
              GROUP BY hash HAVING COUNT(*) > 1
            )
          ORDER BY hash
        `).all();
        const groupsByHash = new Map();
        for (const row of rows) {
          const g = groupsByHash.get(row.hash) || { hash: row.hash, items: [] };
          g.items.push(row);
          groupsByHash.set(row.hash, g);
        }
        const groups = [...groupsByHash.values()].map(g => ({ ...g, count: g.items.length }));
        if (countOnly) {
          let copyCount = 0;
          for (const g of groups) copyCount += g.count - 1;
          return { groupCount: groups.length, copyCount };
        }
        return { groups };
      },
      mergeDuplicates: function({ keepId, removeIds }) {
        if (keepId == null || !Array.isArray(removeIds)) {
          return { error: 'Missing required fields: keepId, removeIds', status: 400 };
        }
        const master = db.prepare('SELECT * FROM media WHERE id = ?').get(Number(keepId));
        if (!master) return { error: 'Master record not found', status: 404 };
        return { media: master, merged: removeIds.length, deletedFiles: removeIds.length };
      },
      getMediaById: function(id) {
        return db.prepare('SELECT * FROM media WHERE id = ?').get(Number(id)) || null;
      },
      likeMedia: function(id) {
        const existing = db.prepare('SELECT likes FROM media WHERE id = ?').get(Number(id));
        if (!existing) return null;
        const newlyLiked = existing.likes === 0;
        db.prepare('UPDATE media SET likes = likes + 1 WHERE id = ?').run(Number(id));
        const media = this.getMediaById(id);
        if (newlyLiked) {
          const { total } = db.prepare('SELECT COUNT(*) AS total FROM media WHERE hidden = 0 AND likes > 0').get();
          media.likedCount = total;
        }
        return media;
      },
      removeMedia: function(id) {
        const result = db.prepare('DELETE FROM media WHERE id = ?').run(Number(id));
        return { deleted: result.changes > 0 };
      },
      addMedia: function(folderId, folderName, files) {
        let added = 0;
        for (const file of files) {
          const ext = file.name.match(/\.[^.]+$/)?.[0]?.toLowerCase() || '';
          const title = file.name.replace(/\.[^.]+$/, '');
          const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
          const mediaPath = `${folderId}:${file.path}`;

          const result = db.prepare(
            'INSERT OR IGNORE INTO media (path, title, type, folder, status) VALUES (?, ?, ?, ?, ?)'
          ).run(mediaPath, title, isImage ? 'image' : 'video', folderName, 'ready');
          if (result.changes > 0) added++;
        }
        return { added };
      },

    },
  };

  const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

  // Register endpoints
  await endpoint_get_media(kojo, logger);
  await endpoint_get_media_id(kojo, logger);
  await endpoint_get_duplicates(kojo, logger);
  await endpoint_post_duplicates_merge(kojo, logger);
  await endpoint_patch_like(kojo, logger);
  await endpoint_post_add(kojo, logger);
  await endpoint_delete(kojo, logger);
  await endpoint_delete_folder(kojo, logger);
  await endpoint_patch_folder(kojo, logger);
  await endpoint_patch_media_thumbnail(kojo, logger);
}

function mockRes() {
  const res = {
    _status: null,
    _headers: {},
    _body: null,
    writeHead(status, headers = {}) {
      res._status = status;
      Object.assign(res._headers, headers);
    },
    setHeader(key, val) {
      res._headers[key] = val;
    },
    end(data) {
      res._body = data ? JSON.parse(data) : null;
    },
  };
  return res;
}

function mockReq(method, path, body = null, params = {}) {
  const listeners = {};
  return {
    method,
    url: path,
    headers: { host: `localhost:${config.serverPort}` },
    params,
    on(event, cb) { listeners[event] = cb; },
    emit() {
      if (body) listeners.data?.(Buffer.from(JSON.stringify(body)));
      listeners.end?.();
    },
  };
}

function findRoute(method, pathname) {
  return routes.find(r => r.method === method && r.pathname === pathname);
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

test('GET /media', async (t) => {
  await setup();

  await t.test('returns empty result initially', async () => {
    const route = findRoute('GET', '/media');
    const req = mockReq('GET', '/media');
    const res = mockRes();

    await route.handler(req, res);

    t.assert.strictEqual(res._status, 200);
    t.assert.deepStrictEqual(res._body.items, []);
    t.assert.strictEqual(res._body.total, 0);
  });

  await t.test('returns added items', async () => {
    // Add items directly
    db.exec("INSERT INTO media (path, title, type, status) VALUES ('test.jpg', 'Test', 'image', 'ready')");

    const route = findRoute('GET', '/media');
    const req = mockReq('GET', '/media');
    const res = mockRes();

    await route.handler(req, res);

    t.assert.strictEqual(res._status, 200);
    t.assert.strictEqual(res._body.items.length, 1);
    t.assert.strictEqual(res._body.items[0].title, 'Test');
    t.assert.strictEqual(res._body.total, 1);
  });
});

test('GET /media/:id', async (t) => {
  await setup();

  await t.test('returns 404 for non-existent', async () => {
    const route = findRoute('GET', '/media/:id');
    const req = mockReq('GET', '/media/999');
    const res = mockRes();

    await route.handler(req, res, { id: '999' });

    t.assert.strictEqual(res._status, 404);
  });

  await t.test('returns specific item', async () => {
    const { lastInsertRowid: id } = db.prepare("INSERT INTO media (path, title, type, status) VALUES ('x.jpg', 'X', 'image', 'ready')").run();

    const route = findRoute('GET', '/media/:id');
    const req = mockReq('GET', `/media/${id}`);
    const res = mockRes();

    await route.handler(req, res, { id: String(id) });

    t.assert.strictEqual(res._status, 200);
    t.assert.strictEqual(res._body.title, 'X');
  });
});

test('PATCH /media/:id/like', async (t) => {
  await setup();

  await t.test('increments like count', async () => {
    const { lastInsertRowid: id } = db.prepare("INSERT INTO media (path, title, type, status, likes) VALUES ('like.jpg', 'Like', 'image', 'ready', 0)").run();

    const route = findRoute('PATCH', '/media/:id/like');
    const req = mockReq('PATCH', `/media/${id}/like`);
    const res = mockRes();

    await route.handler(req, res, { id: String(id) });

    t.assert.strictEqual(res._status, 200);
    t.assert.strictEqual(res._body.likes, 1);
    t.assert.strictEqual(res._body.likedCount, 1);

    // Like again
    const res2 = mockRes();
    await route.handler(req, res2, { id: String(id) });
    t.assert.strictEqual(res2._body.likes, 2);
    t.assert.strictEqual('likedCount' in res2._body, false);
  });

  await t.test('returns 404 for non-existent', async () => {
    const route = findRoute('PATCH', '/media/:id/like');
    const req = mockReq('PATCH', '/media/99999/like');
    const res = mockRes();

    await route.handler(req, res, { id: '99999' });

    t.assert.strictEqual(res._status, 404);
  });
});

test('POST /media/add', async (t) => {
  await setup();

  await t.test('adds media items', async () => {
    const route = findRoute('POST', '/media/add');
    const req = mockReq('POST', '/media/add', {
      folderId: 'folder-123',
      folderName: 'Photos',
      files: [
        { name: 'a.jpg', path: 'a.jpg' },
        { name: 'b.mp4', path: 'b.mp4' },
      ],
    });
    const res = mockRes();

    const promise = route.handler(req, res);
    req.emit();
    await promise;

    t.assert.strictEqual(res._status, 200);
    t.assert.strictEqual(res._body.added, 2);
  });

  await t.test('validates required fields', async () => {
    const route = findRoute('POST', '/media/add');
    const req = mockReq('POST', '/media/add', { folderId: 'test' });
    const res = mockRes();

    const promise = route.handler(req, res);
    req.emit();
    await promise;

    t.assert.strictEqual(res._status, 400);
  });
});

test('DELETE /media/:id', async (t) => {
  await setup();

  await t.test('removes item', async () => {
    const { lastInsertRowid: id } = db.prepare("INSERT INTO media (path, title, type, status) VALUES ('del.jpg', 'Del', 'image', 'ready')").run();

    const route = findRoute('DELETE', '/media/:id');
    const req = mockReq('DELETE', `/media/${id}`);
    const res = mockRes();

    await route.handler(req, res, { id: String(id) });

    t.assert.strictEqual(res._status, 200);
    t.assert.strictEqual(res._body.deleted, true);
  });

  await t.test('returns 404 for non-existent', async () => {
    const route = findRoute('DELETE', '/media/:id');
    const req = mockReq('DELETE', '/media/99999');
    const res = mockRes();

    await route.handler(req, res, { id: '99999' });

    t.assert.strictEqual(res._status, 404);
  });
});

test('DELETE /media/folder/:id', async (t) => {
  await setup();

  await t.test('returns 404 for non-existent folder', async () => {
    const route = findRoute('DELETE', '/media/folder/:id');
    const req = mockReq('DELETE', '/media/folder/999');
    const res = mockRes();

    await route.handler(req, res, { id: '999' });

    t.assert.strictEqual(res._status, 404);
  });

  await t.test('hides media in the folder', async () => {
    db.prepare("INSERT INTO folders (path) VALUES (?)").run('D:\\photos');
    const folderId = db.prepare("SELECT id FROM folders WHERE path = ?").get('D:\\photos').id;
    db.prepare("INSERT INTO media (path, title, type, status, folder) VALUES (?, ?, ?, ?, ?)").run('D:\\photos\\a.jpg', 'A', 'image', 'ready', 'D:\\photos');
    db.prepare("INSERT INTO media (path, title, type, status, folder) VALUES (?, ?, ?, ?, ?)").run('D:\\photos\\b.jpg', 'B', 'image', 'ready', 'D:\\photos');

    const route = findRoute('DELETE', '/media/folder/:id');
    const req = mockReq('DELETE', `/media/folder/${folderId}`);
    const res = mockRes();

    await route.handler(req, res, { id: String(folderId) });

    t.assert.strictEqual(res._status, 200);
    t.assert.strictEqual(res._body.hidden, 2);

    /* Verify media is hidden. */
    const visible = db.prepare("SELECT COUNT(*) as c FROM media WHERE folder = ? AND hidden = 0").get('D:\\photos');
    t.assert.strictEqual(visible.c, 0);
  });

  await t.test('hides media in subfolders too', async () => {
    db.prepare("INSERT INTO folders (path) VALUES (?)").run('D:\\root');
    db.prepare("INSERT INTO folders (path) VALUES (?)").run('D:\\root\\sub');
    db.prepare("INSERT INTO folders (path) VALUES (?)").run('D:\\root\\sub\\deep');
    const folderId = db.prepare("SELECT id FROM folders WHERE path = ?").get('D:\\root').id;

    db.prepare("INSERT INTO media (path, title, type, status, folder) VALUES (?, ?, ?, ?, ?)").run('D:\\root\\a.jpg', 'A', 'image', 'ready', 'D:\\root');
    db.prepare("INSERT INTO media (path, title, type, status, folder) VALUES (?, ?, ?, ?, ?)").run('D:\\root\\sub\\b.jpg', 'B', 'image', 'ready', 'D:\\root\\sub');
    db.prepare("INSERT INTO media (path, title, type, status, folder) VALUES (?, ?, ?, ?, ?)").run('D:\\root\\sub\\deep\\c.jpg', 'C', 'image', 'ready', 'D:\\root\\sub\\deep');

    const route = findRoute('DELETE', '/media/folder/:id');
    const req = mockReq('DELETE', `/media/folder/${folderId}`);
    const res = mockRes();

    await route.handler(req, res, { id: String(folderId) });

    t.assert.strictEqual(res._status, 200);
    t.assert.strictEqual(res._body.hidden, 3);

    /* All three should be hidden. */
    const visible = db.prepare("SELECT COUNT(*) as c FROM media WHERE (folder = ? OR folder LIKE ?) AND hidden = 0").get('D:\\root', 'D:\\root\\%');
    t.assert.strictEqual(visible.c, 0);
  });

  await t.test('does not hide media in unrelated folders', async () => {
    db.prepare("INSERT INTO folders (path) VALUES (?)").run('D:\\target');
    db.prepare("INSERT INTO folders (path) VALUES (?)").run('D:\\other');
    const targetId = db.prepare("SELECT id FROM folders WHERE path = ?").get('D:\\target').id;

    db.prepare("INSERT INTO media (path, title, type, status, folder) VALUES (?, ?, ?, ?, ?)").run('D:\\target\\a.jpg', 'A', 'image', 'ready', 'D:\\target');
    db.prepare("INSERT INTO media (path, title, type, status, folder) VALUES (?, ?, ?, ?, ?)").run('D:\\other\\b.jpg', 'B', 'image', 'ready', 'D:\\other');

    const route = findRoute('DELETE', '/media/folder/:id');
    const req = mockReq('DELETE', `/media/folder/${targetId}`);
    const res = mockRes();

    await route.handler(req, res, { id: String(targetId) });

    t.assert.strictEqual(res._body.hidden, 1);

    /* Other folder's media should still be visible. */
    const other = db.prepare("SELECT hidden FROM media WHERE folder = ?").get('D:\\other');
    t.assert.strictEqual(other.hidden, 0);
  });
});

test('PATCH /folders/:id', async (t) => {
  await setup();

  await t.test('sets a folder thumbnail from media in the same folder', async (t) => {
    db.prepare("INSERT INTO folders (path) VALUES (?)").run('D:\\photos');
    const folderId = db.prepare("SELECT id FROM folders WHERE path = ?").get('D:\\photos').id;
    const { lastInsertRowid: mediaId } = db.prepare("INSERT INTO media (path, title, type, status, folder) VALUES (?, ?, ?, ?, ?)").run('D:\\photos\\thumb.jpg', 'Thumb', 'image', 'ready', 'D:\\photos');

    const route = findRoute('PATCH', '/folders/:id');
    const req = mockReq('PATCH', `/folders/${folderId}`, { thumbnailMediaId: mediaId });
    const res = mockRes();

    const promise = route.handler(req, res, { id: String(folderId) });
    req.emit();
    await promise;

    t.assert.strictEqual(res._status, 200);
    t.assert.strictEqual(res._body.thumbnailMediaId, mediaId);

    const row = db.prepare('SELECT thumbnail_media_id FROM folders WHERE id = ?').get(folderId);
    t.assert.strictEqual(row.thumbnail_media_id, mediaId);
  });

  await t.test('rejects thumbnail from a different folder', async (t) => {
    db.prepare("INSERT INTO folders (path) VALUES (?)").run('D:\\reject');
    db.prepare("INSERT INTO folders (path) VALUES (?)").run('D:\\other');
    const folderId = db.prepare("SELECT id FROM folders WHERE path = ?").get('D:\\reject').id;
    const { lastInsertRowid: mediaId } = db.prepare("INSERT INTO media (path, title, type, status, folder) VALUES (?, ?, ?, ?, ?)").run('D:\\other\\thumb.jpg', 'Thumb', 'image', 'ready', 'D:\\other');

    const route = findRoute('PATCH', '/folders/:id');
    const req = mockReq('PATCH', `/folders/${folderId}`, { thumbnailMediaId: mediaId });
    const res = mockRes();

    const promise = route.handler(req, res, { id: String(folderId) });
    req.emit();
    await promise;

    t.assert.strictEqual(res._status, 400);
  });

  await t.test('renames folder without changing thumbnail', async (t) => {
    db.prepare("INSERT INTO folders (path, name) VALUES (?, ?)").run('D:\\rename', 'Old');
    const folderId = db.prepare("SELECT id FROM folders WHERE path = ?").get('D:\\rename').id;

    const route = findRoute('PATCH', '/folders/:id');
    const req = mockReq('PATCH', `/folders/${folderId}`, { name: 'New' });
    const res = mockRes();

    const promise = route.handler(req, res, { id: String(folderId) });
    req.emit();
    await promise;

    t.assert.strictEqual(res._status, 200);
    t.assert.strictEqual(res._body.name, 'New');
    t.assert.strictEqual(res._body.thumbnailMediaId, null);
  });

  await t.test('sets a video thumbnail with a time offset', async (t) => {
    db.prepare("INSERT INTO folders (path) VALUES (?)").run('D:\\time');
    const folderId = db.prepare("SELECT id FROM folders WHERE path = ?").get('D:\\time').id;
    const { lastInsertRowid: mediaId } = db.prepare("INSERT INTO media (path, title, type, status, folder) VALUES (?, ?, ?, ?, ?)").run('D:\\time\\clip.mp4', 'Clip', 'video', 'ready', 'D:\\time');

    const route = findRoute('PATCH', '/folders/:id');
    const req = mockReq('PATCH', `/folders/${folderId}`, { thumbnailMediaId: mediaId, thumbnailTime: 12.5 });
    const res = mockRes();

    const promise = route.handler(req, res, { id: String(folderId) });
    req.emit();
    await promise;

    t.assert.strictEqual(res._status, 200);
    t.assert.strictEqual(res._body.thumbnailMediaId, mediaId);
    t.assert.strictEqual(res._body.thumbnailTime, 12.5);

    const row = db.prepare('SELECT thumbnail_media_id, thumbnail_time FROM folders WHERE id = ?').get(folderId);
    t.assert.strictEqual(row.thumbnail_media_id, mediaId);
    t.assert.strictEqual(row.thumbnail_time, 12.5);
  });

  await t.test('rejects time offset for image media', async (t) => {
    db.prepare("INSERT INTO folders (path) VALUES (?)").run('D:\\imgtime');
    const folderId = db.prepare("SELECT id FROM folders WHERE path = ?").get('D:\\imgtime').id;
    const { lastInsertRowid: mediaId } = db.prepare("INSERT INTO media (path, title, type, status, folder) VALUES (?, ?, ?, ?, ?)").run('D:\\imgtime\\photo.jpg', 'Photo', 'image', 'ready', 'D:\\imgtime');

    const route = findRoute('PATCH', '/folders/:id');
    const req = mockReq('PATCH', `/folders/${folderId}`, { thumbnailMediaId: mediaId, thumbnailTime: 5 });
    const res = mockRes();

    const promise = route.handler(req, res, { id: String(folderId) });
    req.emit();
    await promise;

    t.assert.strictEqual(res._status, 400);
  });
});

test('PATCH /media/:id/thumbnail', async (t) => {
  await setup();

  await t.test('sets a custom thumbnail time for a video', async (t) => {
    const { lastInsertRowid: mediaId } = db.prepare("INSERT INTO media (path, title, type, status, folder) VALUES (?, ?, ?, ?, ?)").run('D:\\vids\\clip.mp4', 'Clip', 'video', 'ready', 'D:\\vids');

    const route = findRoute('PATCH', '/media/:id/thumbnail');
    const req = mockReq('PATCH', `/media/${mediaId}/thumbnail`, { thumbnailTime: 23.4 });
    const res = mockRes();

    const promise = route.handler(req, res, { id: String(mediaId) });
    req.emit();
    await promise;

    t.assert.strictEqual(res._status, 200);
    t.assert.strictEqual(res._body.thumbnail_time, 23.4);

    const row = db.prepare('SELECT thumbnail_time FROM media WHERE id = ?').get(mediaId);
    t.assert.strictEqual(row.thumbnail_time, 23.4);
  });

  await t.test('rejects thumbnail time for images', async (t) => {
    const { lastInsertRowid: mediaId } = db.prepare("INSERT INTO media (path, title, type, status, folder) VALUES (?, ?, ?, ?, ?)").run('D:\\pics\\photo.jpg', 'Photo', 'image', 'ready', 'D:\\pics');

    const route = findRoute('PATCH', '/media/:id/thumbnail');
    const req = mockReq('PATCH', `/media/${mediaId}/thumbnail`, { thumbnailTime: 5 });
    const res = mockRes();

    const promise = route.handler(req, res, { id: String(mediaId) });
    req.emit();
    await promise;

    t.assert.strictEqual(res._status, 400);
  });

  await t.test('returns 404 for non-existent media', async (t) => {
    const route = findRoute('PATCH', '/media/:id/thumbnail');
    const req = mockReq('PATCH', '/media/99999/thumbnail', { thumbnailTime: 5 });
    const res = mockRes();

    const promise = route.handler(req, res, { id: '99999' });
    req.emit();
    await promise;

    t.assert.strictEqual(res._status, 404);
  });
});

test('GET /duplicates', async (t) => {
  await setup();

  await t.test('returns no groups when there are no duplicates', async () => {
    const route = findRoute('GET', '/duplicates');
    const req = mockReq('GET', '/duplicates');
    const res = mockRes();

    await route.handler(req, res);

    t.assert.strictEqual(res._status, 200);
    t.assert.strictEqual(res._body.groups.length, 0);
  });

  await t.test('groups items sharing the same hash', async () => {
    db.prepare("INSERT INTO media (path, title, type, status, hash) VALUES ('/dup-a.jpg', 'A', 'image', 'ready', 'same')").run();
    db.prepare("INSERT INTO media (path, title, type, status, hash) VALUES ('/dup-b.jpg', 'B', 'image', 'ready', 'same')").run();
    db.prepare("INSERT INTO media (path, title, type, status, hash) VALUES ('/other-c.jpg', 'C', 'image', 'ready', 'other')").run();

    const route = findRoute('GET', '/duplicates');
    const req = mockReq('GET', '/duplicates');
    const res = mockRes();

    await route.handler(req, res);

    t.assert.strictEqual(res._status, 200);
    t.assert.strictEqual(res._body.groups.length, 1);
    t.assert.strictEqual(res._body.groups[0].hash, 'same');
    t.assert.strictEqual(res._body.groups[0].count, 2);
    t.assert.strictEqual(res._body.groups[0].items.length, 2);
  });
});

test('GET /duplicates?count=1', async (t) => {
  await setup();

  await t.test('returns aggregate counts only', async () => {
    db.prepare("INSERT INTO media (path, title, type, status, hash) VALUES ('/c-1.jpg', 'A', 'image', 'ready', 'same')").run();
    db.prepare("INSERT INTO media (path, title, type, status, hash) VALUES ('/c-2.jpg', 'B', 'image', 'ready', 'same')").run();
    db.prepare("INSERT INTO media (path, title, type, status, hash) VALUES ('/c-3.jpg', 'C', 'image', 'ready', 'same')").run();
    db.prepare("INSERT INTO media (path, title, type, status, hash) VALUES ('/o-1.jpg', 'D', 'image', 'ready', 'other')").run();
    db.prepare("INSERT INTO media (path, title, type, status, hash) VALUES ('/o-2.jpg', 'E', 'image', 'ready', 'other')").run();

    const route = findRoute('GET', '/duplicates');
    const req = mockReq('GET', '/duplicates?count=1');
    const res = mockRes();

    await route.handler(req, res);

    t.assert.strictEqual(res._status, 200);
    t.assert.strictEqual(res._body.groupCount, 2);
    /* Group 1 has 3 items (2 extra copies), group 2 has 2 items (1 extra). */
    t.assert.strictEqual(res._body.copyCount, 3);
    t.assert.strictEqual('groups' in res._body, false);
  });
});

test('POST /duplicates/merge', async (t) => {
  await setup();

  await t.test('merges and returns the kept record', async () => {
    const { lastInsertRowid: keepId } = db.prepare("INSERT INTO media (path, title, type, status, hash) VALUES ('/keep.jpg', 'Keep', 'image', 'ready', 'same')").run();
    const { lastInsertRowid: dupId } = db.prepare("INSERT INTO media (path, title, type, status, hash) VALUES ('/dup.jpg', 'Dup', 'image', 'ready', 'same')").run();

    const route = findRoute('POST', '/duplicates/merge');
    const req = mockReq('POST', '/duplicates/merge', { keepId, removeIds: [dupId] });
    const res = mockRes();

    const promise = route.handler(req, res);
    req.emit();
    await promise;

    t.assert.strictEqual(res._status, 200);
    t.assert.strictEqual(res._body.merged, 1);
    t.assert.strictEqual(res._body.deletedFiles, 1);
    t.assert.strictEqual(res._body.media.id, keepId);
  });

  await t.test('rejects when required fields are missing', async () => {
    const route = findRoute('POST', '/duplicates/merge');
    const req = mockReq('POST', '/duplicates/merge', { keepId: 1 });
    const res = mockRes();

    const promise = route.handler(req, res);
    req.emit();
    await promise;

    t.assert.strictEqual(res._status, 400);
  });

  await t.test('returns 404 for a missing master', async () => {
    const route = findRoute('POST', '/duplicates/merge');
    const req = mockReq('POST', '/duplicates/merge', { keepId: 9999, removeIds: [1] });
    const res = mockRes();

    const promise = route.handler(req, res);
    req.emit();
    await promise;

    t.assert.strictEqual(res._status, 404);
  });
});

