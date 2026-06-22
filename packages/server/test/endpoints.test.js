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
import endpoint_patch_like from '../endpoints/25_patch_media_id_like.js';
import endpoint_post_scan from '../endpoints/30_post_media_scan.js';
import endpoint_post_add from '../endpoints/35_post_media_add.js';
import endpoint_delete from '../endpoints/40_delete_media_id.js';
import endpoint_delete_folder from '../endpoints/45_delete_media_folder.js';
import endpoint_get_jobs from '../endpoints/60_get_jobs.js';

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
      getMediaById: function(id) {
        return db.prepare('SELECT * FROM media WHERE id = ?').get(Number(id)) || null;
      },
      likeMedia: function(id) {
        const result = db.prepare('UPDATE media SET likes = likes + 1 WHERE id = ?').run(Number(id));
        if (result.changes === 0) return null;
        return this.getMediaById(id);
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
      listJobs: function() {
        return db.prepare('SELECT * FROM jobs ORDER BY created_at DESC').all();
      },
    },
  };

  const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

  // Register endpoints
  await endpoint_get_media(kojo, logger);
  await endpoint_get_media_id(kojo, logger);
  await endpoint_patch_like(kojo, logger);
  await endpoint_post_add(kojo, logger);
  await endpoint_delete(kojo, logger);
  await endpoint_delete_folder(kojo, logger);
  await endpoint_get_jobs(kojo, logger);
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

    // Like again
    const res2 = mockRes();
    await route.handler(req, res2, { id: String(id) });
    t.assert.strictEqual(res2._body.likes, 2);
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

test('GET /jobs', async (t) => {
  await setup();

  await t.test('returns empty array initially', async () => {
    const route = findRoute('GET', '/jobs');
    const req = mockReq('GET', '/jobs');
    const res = mockRes();

    await route.handler(req, res);

    t.assert.strictEqual(res._status, 200);
    t.assert.deepStrictEqual(res._body, []);
  });
});
