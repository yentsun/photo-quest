/**
 * @file Tests for the storage stats and backup helpers (issue #65).
 *
 * Covers:
 *  - Directory size/count aggregation (nested, missing)
 *  - Volume free-space reporting
 *  - The full storage report: database + WAL, thumbnails, transcoded outputs,
 *    originals, and the volumes involved
 *  - Consistent database snapshots via VACUUM INTO (including from a WAL
 *    database)
 *  - Manifest rendering as CSV and JSON
 */

import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync as Database } from 'node:sqlite';
import { CREATE_MEDIA_TABLE } from '@photo-quest/shared';
import {
  collectStorageStats,
  collectVolumeRoots,
  createDbSnapshot,
  dirStats,
  diskSpace,
  buildManifest,
  toCsv,
} from '../src/storage.js';

/** Minimal media table plus the migrations the base schema does not carry. */
function applySchema(db) {
  db.exec(CREATE_MEDIA_TABLE);
  db.exec("ALTER TABLE media ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'");
  return db;
}

function freshDb() {
  return applySchema(new Database(':memory:'));
}

/** Insert a media row; returns its id. */
function insertMedia(db, mediaPath, {
  title = 'Test',
  type = 'video',
  folder = null,
  size = null,
  likes = 0,
  tags = '[]',
  status = 'ready',
  hash = null,
  dateTaken = null,
  transcodedPath = null,
  hidden = 0,
} = {}) {
  const { lastInsertRowid } = db.prepare(`
    INSERT INTO media (path, title, type, folder, size, likes, tags, status, hash, date_taken, transcoded_path, hidden)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(mediaPath, title, type, folder, size, likes, tags, status, hash, dateTaken, transcodedPath, hidden);
  return lastInsertRowid;
}

test('storage', async (t) => {
  let root;
  t.beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'pq-storage-')); });
  t.afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  /* ---------------------------------------------------------------- */
  /* Directory / volume helpers                                       */
  /* ---------------------------------------------------------------- */

  await t.test('dirStats sums nested files and reports their count', async () => {
    const dir = path.join(root, 'thumbs');
    fs.mkdirSync(path.join(dir, 'nested'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'a.jpg'), Buffer.alloc(100));
    fs.writeFileSync(path.join(dir, 'b.jpg'), Buffer.alloc(50));
    fs.writeFileSync(path.join(dir, 'nested', 'c.jpg'), Buffer.alloc(25));

    const stats = await dirStats(dir);

    t.assert.strictEqual(stats.bytes, 175);
    t.assert.strictEqual(stats.count, 3);
  });

  await t.test('dirStats reports zeroes for a missing directory', async () => {
    const stats = await dirStats(path.join(root, 'nope'));

    t.assert.strictEqual(stats.bytes, 0);
    t.assert.strictEqual(stats.count, 0);
  });

  await t.test('diskSpace reports totals for a real path and null for a missing one', async () => {
    const space = await diskSpace(root);

    t.assert.ok(space);
    t.assert.ok(space.total > 0);
    t.assert.ok(space.free >= 0);
    t.assert.strictEqual(space.used, space.total - space.free);

    t.assert.strictEqual(await diskSpace(path.join(root, 'nope')), null);
  });

  await t.test('collectVolumeRoots de-duplicates roots and skips hidden rows', () => {
    const db = freshDb();
    const dbPath = path.join(root, 'lib.db');
    const otherRoot = process.platform === 'win32' ? 'Z:\\elsewhere' : '/elsewhere';

    insertMedia(db, path.join(root, 'a.jpg'), { folder: root });
    insertMedia(db, path.join(root, 'nested', 'b.jpg'), { folder: path.join(root, 'nested') });
    insertMedia(db, path.join(root, 'c.jpg'), { folder: otherRoot });
    insertMedia(db, path.join(root, 'hidden.jpg'), { folder: 'W:\\gone', hidden: 1 });

    const roots = collectVolumeRoots(db, dbPath);

    const expected = new Set([
      path.parse(dbPath).root,
      path.parse(root).root,
      path.parse(otherRoot).root,
    ]);
    t.assert.deepStrictEqual(roots, [...expected].sort());
  });

  /* ---------------------------------------------------------------- */
  /* Full report                                                      */
  /* ---------------------------------------------------------------- */

  await t.test('collectStorageStats reports every category', async () => {
    const dbPath = path.join(root, 'lib.db');
    fs.writeFileSync(dbPath, Buffer.alloc(1000));
    fs.writeFileSync(`${dbPath}-wal`, Buffer.alloc(200));

    const thumbsDir = path.join(root, 'thumbs');
    fs.mkdirSync(thumbsDir, { recursive: true });
    fs.writeFileSync(path.join(thumbsDir, '1.jpg'), Buffer.alloc(300));
    fs.writeFileSync(path.join(thumbsDir, '2.jpg'), Buffer.alloc(300));

    const transcoded = path.join(root, 'clip_converted.mp4');
    fs.writeFileSync(transcoded, Buffer.alloc(400));
    const transcodedGone = path.join(root, 'missing_converted.mp4');

    const db = freshDb();
    insertMedia(db, path.join(root, 'a.jpg'), { type: 'image', folder: root, size: 10, transcodedPath: transcoded });
    insertMedia(db, path.join(root, 'b.mp4'), { type: 'video', folder: root, size: 20, transcodedPath: transcodedGone });
    insertMedia(db, path.join(root, 'c.mp4'), { type: 'video', folder: root, size: 30 });
    insertMedia(db, path.join(root, 'gone.jpg'), { type: 'image', folder: root, size: 999, hidden: 1 });

    const stats = await collectStorageStats({ db, dbPath, thumbsDir });

    t.assert.strictEqual(stats.db.path, dbPath);
    t.assert.strictEqual(stats.db.dir, root);
    t.assert.strictEqual(stats.db.bytes, 1000);
    t.assert.strictEqual(stats.db.walBytes, 200);
    t.assert.strictEqual(stats.db.shmBytes, 0);

    t.assert.strictEqual(stats.thumbs.path, thumbsDir);
    t.assert.strictEqual(stats.thumbs.bytes, 600);
    t.assert.strictEqual(stats.thumbs.count, 2);

    /* A transcoded output that has since vanished contributes no bytes and is
       left out of the count. */
    t.assert.strictEqual(stats.transcodes.bytes, 400);
    t.assert.strictEqual(stats.transcodes.count, 1);

    t.assert.strictEqual(stats.originals.bytes, 60);
    t.assert.strictEqual(stats.originals.count, 3);
    t.assert.strictEqual(stats.originals.images, 1);
    t.assert.strictEqual(stats.originals.videos, 2);

    t.assert.ok(stats.volumes.length >= 1);
    const [volume] = stats.volumes;
    t.assert.ok(volume.total > 0);
    t.assert.ok(volume.free >= 0);
  });

  /* ---------------------------------------------------------------- */
  /* Snapshots                                                        */
  /* ---------------------------------------------------------------- */

  await t.test('createDbSnapshot writes a readable copy of a WAL database', async () => {
    const dbPath = path.join(root, 'lib.db');
    const db = new Database(dbPath);
    db.exec('PRAGMA journal_mode = WAL');
    applySchema(db);
    insertMedia(db, path.join(root, 'a.jpg'), { title: 'Alpha' });
    insertMedia(db, path.join(root, 'b.jpg'), { title: 'Beta' });

    const snapshot = path.join(root, 'snapshot.db');
    createDbSnapshot(db, snapshot);

    t.assert.ok(fs.existsSync(snapshot));

    const copy = new Database(snapshot);
    const rows = copy.prepare('SELECT title FROM media ORDER BY title').all();

    t.assert.deepStrictEqual(rows.map((row) => row.title), ['Alpha', 'Beta']);

    copy.close();
    db.close();
  });

  await t.test('createDbSnapshot leaves the live database usable', async () => {
    const dbPath = path.join(root, 'lib.db');
    const db = new Database(dbPath);
    db.exec('PRAGMA journal_mode = WAL');
    applySchema(db);

    createDbSnapshot(db, path.join(root, 'snapshot.db'));
    insertMedia(db, path.join(root, 'later.jpg'), { title: 'Later' });

    const { n } = db.prepare('SELECT COUNT(*) AS n FROM media').get();
    t.assert.strictEqual(n, 1);

    db.close();
  });

  /* ---------------------------------------------------------------- */
  /* Manifest                                                         */
  /* ---------------------------------------------------------------- */

  await t.test('toCsv quotes delimiters, doubles quotes and uses CRLF', () => {
    const csv = toCsv([{ id: 1, path: 'C:\\a, b\\"c".jpg', title: 'Two\nlines' }]);

    t.assert.ok(csv.startsWith('\ufeff'));
    t.assert.ok(csv.includes('\r\n'));
    t.assert.ok(csv.includes('"C:\\a, b\\""c"".jpg"'));
    t.assert.ok(csv.includes('"Two\nlines"'));
  });

  await t.test('buildManifest renders CSV with parsed tags and skips hidden rows', () => {
    const db = freshDb();
    insertMedia(db, 'C:\\media\\a.jpg', {
      type: 'image', size: 10, likes: 3, tags: '["beach","sunset"]', folder: 'C:\\media',
    });
    insertMedia(db, 'C:\\media\\hidden.jpg', { tags: '["nope"]', hidden: 1 });

    const { contentType, body, count } = buildManifest(db, 'csv');

    t.assert.ok(contentType.startsWith('text/csv'));
    t.assert.strictEqual(count, 1);

    const lines = body.replace('\ufeff', '').trim().split('\r\n');
    t.assert.strictEqual(lines.length, 2);
    t.assert.strictEqual(lines[0], 'id,path,title,type,folder,size,likes,tags,status,hash,date_taken,transcoded_path');
    t.assert.ok(lines[1].includes('beach|sunset'));
    t.assert.ok(!lines[1].includes('nope'));
  });

  await t.test('buildManifest renders JSON with a tags array and a generated_at stamp', () => {
    const db = freshDb();
    insertMedia(db, 'C:\\media\\a.jpg', { tags: '["beach"]' });
    insertMedia(db, 'C:\\media\\b.mp4', { tags: 'not json' });

    const { contentType, body, count } = buildManifest(db, 'json');
    const parsed = JSON.parse(body);

    t.assert.ok(contentType.startsWith('application/json'));
    t.assert.strictEqual(count, 2);
    t.assert.ok(typeof parsed.generated_at === 'string');
    t.assert.deepStrictEqual(parsed.items[0].tags, ['beach']);
    t.assert.deepStrictEqual(parsed.items[1].tags, []);
  });

  await t.test('buildManifest defaults to CSV for unknown formats', () => {
    const db = freshDb();
    insertMedia(db, 'C:\\media\\a.jpg');

    t.assert.ok(buildManifest(db, 'xml').contentType.startsWith('text/csv'));
  });
});
