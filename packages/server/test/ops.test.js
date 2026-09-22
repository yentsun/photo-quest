/**
 * @file Tests for kojo ops -- uses an in-memory better-sqlite3 database.
 *
 * Each test creates a fresh database so they are fully isolated.
 * Ops receive `[kojo, logger]` via `this`, so we build a minimal
 * kojo-like object that holds state and exposes .get()/.set().
 */

import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync as Database } from 'node:sqlite';
import { CREATE_MEDIA_TABLE, CREATE_JOBS_TABLE, CREATE_FOLDERS_TABLE, CREATE_FAILED_SNAPSHOT_TABLE } from '@photo-quest/shared';

/* Import the raw op functions. */
import listMedia from '../ops/listMedia.js';
import listDuplicates from '../ops/listDuplicates.js';
import listFailed, { startHealthScan, removeFromFailedSnapshot } from '../ops/listFailed.js';
import repairFailed from '../ops/repairFailed.js';
import getMediaDuplicates from '../ops/getMediaDuplicates.js';
import mergeDuplicates from '../ops/mergeDuplicates.js';
import deleteDuplicates from '../ops/deleteDuplicates.js';
import getMediaById from '../ops/getMediaById.js';
import removeMedia from '../ops/removeMedia.js';
import likeMedia from '../ops/likeMedia.js';
import updateTags from '../ops/updateTags.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Create a fresh in-memory database with the schema applied. */
function freshDb() {
  const db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(CREATE_MEDIA_TABLE);
  db.exec(CREATE_JOBS_TABLE);
  db.exec(CREATE_FOLDERS_TABLE);
  db.exec(CREATE_FAILED_SNAPSHOT_TABLE);
  db.exec("ALTER TABLE media ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'");
  return db;
}

/** Minimal kojo-like context that ops expect via `this`. */
function makeContext(db) {
  const state = new Map();
  state.set('db', db);

  const kojo = {
    get: (k) => state.get(k),
    set: (k, v) => state.set(k, v),
    ops: {},
  };
  const logger = {
    info() {},
    warn() {},
    error() {},
    debug() {},
  };

  return [kojo, logger];
}

/** Call an op with the fake kojo context. */
function callOp(op, ctx, ...args) {
  return op.apply(ctx, args);
}

/** Insert a media row directly and return its id. */
function insertMedia(db, filePath, title = 'Test') {
  const { lastInsertRowid: id } = db.prepare("INSERT INTO media (path, title, status) VALUES (?, ?, 'pending')").run(filePath, title);
  return id;
}

function writeFixtureFile(root, name, contents) {
  const filePath = path.join(root, name);
  fs.writeFileSync(filePath, contents);
  return filePath;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

test('listMedia op', async (t) => {
  await t.test('returns empty result when no media exists', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);

    const result = callOp(listMedia, ctx);
    t.assert.deepStrictEqual(result.items, []);
    t.assert.strictEqual(result.total, 0);
  });

  await t.test('returns all media rows with total', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);

    insertMedia(db, '/a.mp4', 'A');
    insertMedia(db, '/b.mp4', 'B');

    const result = callOp(listMedia, ctx);
    t.assert.strictEqual(result.items.length, 2);
    t.assert.strictEqual(result.total, 2);
    const titles = result.items.map(r => r.title).sort();
    t.assert.deepStrictEqual(titles, ['A', 'B']);
  });

  await t.test('supports limit and offset', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);

    insertMedia(db, '/a.mp4', 'A');
    insertMedia(db, '/b.mp4', 'B');
    insertMedia(db, '/c.mp4', 'C');

    const result = callOp(listMedia, ctx, { limit: 2, offset: 0 });
    t.assert.strictEqual(result.items.length, 2);
    t.assert.strictEqual(result.total, 3);
  });
});

test('listDuplicates op', async (t) => {
  let root;
  t.beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicates-test-')); });
  t.afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  function insertWithHash(db, name, hash, title = 'Test', contents = hash) {
    const filePath = writeFixtureFile(root, path.basename(name), contents);
    const { lastInsertRowid: id } = db.prepare(
      "INSERT INTO media (path, title, status, hash) VALUES (?, ?, 'pending', ?)"
    ).run(filePath, title, hash);
    return id;
  }

  await t.test('returns empty groups when there are no duplicates', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);

    insertWithHash(db, '/a.jpg', 'hashA');

    const result = callOp(listDuplicates, ctx);
    t.assert.strictEqual(result.groups.length, 0);
  });

  await t.test('groups items sharing the same hash', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);

    insertWithHash(db, '/one.jpg', 'same');
    insertWithHash(db, '/two.jpg', 'same');
    insertWithHash(db, '/three.jpg', 'other');
    insertWithHash(db, '/four.jpg', 'same', 'Fourth');

    const result = callOp(listDuplicates, ctx);

    t.assert.strictEqual(result.groups.length, 1);
    const group = result.groups[0];
    t.assert.strictEqual(group.count, 3);
    t.assert.strictEqual(group.items.length, 3);
    t.assert.strictEqual(group.ids.length, 3);
  });

  await t.test('excludes items with a null/empty hash', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);

    db.prepare("INSERT INTO media (path, title, status) VALUES ('/no-hash.jpg', 'X', 'pending')").run();
    db.prepare("INSERT INTO media (path, title, status, hash) VALUES ('/empty-hash.jpg', 'Y', 'pending', '')").run();
    insertWithHash(db, '/one.jpg', 'same');
    insertWithHash(db, '/two.jpg', 'same');

    const result = callOp(listDuplicates, ctx);
    t.assert.strictEqual(result.groups.length, 1);
  });

  await t.test('excludes hidden media', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);

    insertWithHash(db, '/one.jpg', 'same');
    const hiddenId = insertWithHash(db, '/two.jpg', 'same');
    insertWithHash(db, '/three.jpg', 'same');
    db.prepare('UPDATE media SET hidden = 1 WHERE id = ?').run(hiddenId);

    const result = callOp(listDuplicates, ctx);
    /* Only the two visible rows remain; the hidden one is excluded. */
    t.assert.strictEqual(result.groups.length, 1);
    t.assert.strictEqual(result.groups[0].count, 2);
    t.assert.strictEqual(result.groups[0].items.length, 2);
  });

  await t.test('countOnly returns groupCount and copyCount', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);

    insertWithHash(db, '/a.jpg', 'same');
    insertWithHash(db, '/b.jpg', 'same');
    insertWithHash(db, '/c.jpg', 'same');
    insertWithHash(db, '/d.jpg', 'other');
    insertWithHash(db, '/e.jpg', 'other');

    const result = callOp(listDuplicates, ctx, { countOnly: true });
    t.assert.strictEqual(result.groupCount, 2);
    /* Group 1 has 3 items (2 extra copies), group 2 has 2 items (1 extra). */
    t.assert.strictEqual(result.copyCount, 3);
  });

  await t.test('groups items by stored hash without reading file contents', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);

    /* The referenced files are never created on disk — the listing op must not
       read file bytes (full-content verification is deferred to merge/delete).
       This proves the op is non-blocking on large libraries. */
    db.prepare("INSERT INTO media (path, title, status, hash) VALUES ('/ghost-a.jpg', 'A', 'ready', 'fp')").run();
    db.prepare("INSERT INTO media (path, title, status, hash) VALUES ('/ghost-b.jpg', 'B', 'ready', 'fp')").run();

    const result = callOp(listDuplicates, ctx);
    t.assert.strictEqual(result.groups.length, 1);
    t.assert.strictEqual(result.groups[0].count, 2);
    t.assert.strictEqual(result.groupCount, 1);
    t.assert.strictEqual(result.copyCount, 1);
  });

  await t.test('paginates groups by hash with limit/offset', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);

    insertWithHash(db, '/a.jpg', 'h1');
    insertWithHash(db, '/b.jpg', 'h1');
    insertWithHash(db, '/c.jpg', 'h2');
    insertWithHash(db, '/d.jpg', 'h2');

    const page1 = callOp(listDuplicates, ctx, { limit: 1, offset: 0 });
    t.assert.strictEqual(page1.groups.length, 1);
    t.assert.strictEqual(page1.groups[0].hash, 'h1');
    t.assert.strictEqual(page1.groupCount, 2);
    t.assert.strictEqual(page1.copyCount, 2);

    const page2 = callOp(listDuplicates, ctx, { limit: 1, offset: 1 });
    t.assert.strictEqual(page2.groups.length, 1);
    t.assert.strictEqual(page2.groups[0].hash, 'h2');
  });
});

test('listFailed op', async (t) => {
  let root;
  t.beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'failed-test-')); });
  t.afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  /** Insert a media row. `exists` controls whether the original file is written. */
  function insertRow(db, { name, status = 'ready', hash = null, exists = true, transcoded = null, contents = name }) {
    const filePath = path.join(root, name);
    if (exists) writeFixtureFile(root, name, contents);
    const { lastInsertRowid: id } = db.prepare(
      'INSERT INTO media (path, title, status, hash, transcoded_path) VALUES (?, ?, ?, ?, ?)'
    ).run(filePath, name, status, hash, transcoded);
    return id;
  }

  /* The op serves a cached snapshot, so run the (async) sweep first. */
  const refresh = (ctx) => startHealthScan(ctx[0], ctx[1]);

  await t.test('returns no groups when every file exists', async (t) => {
    const db = freshDb();
    const ctx = makeContext(db);

    insertRow(db, { name: 'a.jpg', hash: 'h1' });
    insertRow(db, { name: 'b.jpg', hash: 'h1' });

    await refresh(ctx);
    const result = callOp(listFailed, ctx);
    t.assert.strictEqual(result.groups.length, 0);
    t.assert.strictEqual(result.groupCount, 0);
    t.assert.strictEqual(result.failedCount, 0);
  });

  await t.test('flags a record whose file is missing', async (t) => {
    const db = freshDb();
    const ctx = makeContext(db);

    const id = insertRow(db, { name: 'gone.jpg', exists: false });

    await refresh(ctx);
    const result = callOp(listFailed, ctx);
    t.assert.strictEqual(result.groupCount, 1);
    t.assert.strictEqual(result.failedCount, 1);
    const group = result.groups[0];
    t.assert.deepStrictEqual(group.failedIds, [id]);
    t.assert.strictEqual(group.failedCount, 1);
    t.assert.strictEqual(group.siblingCount, 0);
    t.assert.strictEqual(group.items[0].health, 'missing');
  });

  await t.test('groups a broken record with its intact copy sharing the hash', async (t) => {
    const db = freshDb();
    const ctx = makeContext(db);

    const broken = insertRow(db, { name: 'gone.jpg', hash: 'same', exists: false });
    const intact = insertRow(db, { name: 'here.jpg', hash: 'same' });

    await refresh(ctx);
    const result = callOp(listFailed, ctx);
    t.assert.strictEqual(result.groupCount, 1);
    t.assert.strictEqual(result.failedCount, 1);
    const group = result.groups[0];
    t.assert.strictEqual(group.hash, 'same');
    t.assert.deepStrictEqual(group.failedIds, [broken]);
    t.assert.strictEqual(group.siblingCount, 1);
    t.assert.strictEqual(group.items.length, 2);
    /* The broken copy is listed first and carries its health reason. */
    t.assert.strictEqual(group.items[0].id, broken);
    t.assert.strictEqual(group.items[0].health, 'missing');
    t.assert.strictEqual(group.items[1].id, intact);
    t.assert.strictEqual(group.items[1].health, null);
  });

  await t.test('does not flag a video whose transcoded file is gone but original survives', async (t) => {
    const db = freshDb();
    const ctx = makeContext(db);

    insertRow(db, { name: 'video.mp4', transcoded: path.join(root, 'missing-transcode.mp4') });

    await refresh(ctx);
    const result = callOp(listFailed, ctx);
    t.assert.strictEqual(result.groupCount, 0);
  });

  await t.test('flags a processing error when the file exists', async (t) => {
    const db = freshDb();
    const ctx = makeContext(db);

    insertRow(db, { name: 'broken.jpg', status: 'error' });

    await refresh(ctx);
    const result = callOp(listFailed, ctx);
    t.assert.strictEqual(result.groupCount, 1);
    t.assert.strictEqual(result.groups[0].items[0].health, 'error');
  });

  await t.test('prefers missing over error when both apply', async (t) => {
    const db = freshDb();
    const ctx = makeContext(db);

    insertRow(db, { name: 'gone.jpg', status: 'error', exists: false });

    await refresh(ctx);
    const result = callOp(listFailed, ctx);
    t.assert.strictEqual(result.groups[0].items[0].health, 'missing');
  });

  await t.test('excludes hidden media', async (t) => {
    const db = freshDb();
    const ctx = makeContext(db);

    const id = insertRow(db, { name: 'gone.jpg', exists: false });
    db.prepare('UPDATE media SET hidden = 1 WHERE id = ?').run(id);

    await refresh(ctx);
    const result = callOp(listFailed, ctx);
    t.assert.strictEqual(result.groupCount, 0);
  });

  await t.test('countOnly returns totals without groups', async (t) => {
    const db = freshDb();
    const ctx = makeContext(db);

    insertRow(db, { name: 'gone-a.jpg', hash: 'same', exists: false });
    insertRow(db, { name: 'here-b.jpg', hash: 'same' });
    insertRow(db, { name: 'gone-c.jpg', exists: false });

    await refresh(ctx);
    const result = callOp(listFailed, ctx, { countOnly: true });
    t.assert.strictEqual(result.groupCount, 2);
    t.assert.strictEqual(result.failedCount, 2);
    t.assert.strictEqual('groups' in result, false);
  });

  await t.test('paginates groups with limit/offset', async (t) => {
    const db = freshDb();
    const ctx = makeContext(db);

    insertRow(db, { name: 'gone-1.jpg', exists: false });
    insertRow(db, { name: 'gone-2.jpg', exists: false });
    insertRow(db, { name: 'gone-3.jpg', exists: false });

    await refresh(ctx);
    const page1 = callOp(listFailed, ctx, { limit: 2, offset: 0 });
    t.assert.strictEqual(page1.groups.length, 2);
    t.assert.strictEqual(page1.groupCount, 3);

    const page2 = callOp(listFailed, ctx, { limit: 2, offset: 2 });
    t.assert.strictEqual(page2.groups.length, 1);
    t.assert.strictEqual(page2.groupCount, 3);
  });
});

test('removeFromFailedSnapshot', async (t) => {
  let root;
  t.beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-test-')); });
  t.afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  function insertRow(db, { name, status = 'ready', hash = null, exists = true }) {
    const filePath = path.join(root, name);
    if (exists) writeFixtureFile(root, name, name);
    const { lastInsertRowid: id } = db.prepare(
      'INSERT INTO media (path, title, status, hash) VALUES (?, ?, ?, ?)'
    ).run(filePath, name, status, hash);
    return id;
  }

  await t.test('drops a repaired record from its group', async (t) => {
    const db = freshDb();
    const ctx = makeContext(db);
    const broken = insertRow(db, { name: 'gone.jpg', status: 'error', hash: 'same', exists: false });
    insertRow(db, { name: 'here.jpg', hash: 'same' });

    await startHealthScan(ctx[0], ctx[1]);
    t.assert.strictEqual(callOp(listFailed, ctx, { countOnly: true }).failedCount, 1);

    const changed = removeFromFailedSnapshot(ctx[0], [broken]);
    t.assert.strictEqual(changed, true);
    const after = callOp(listFailed, ctx, { countOnly: true });
    t.assert.strictEqual(after.failedCount, 0);
    t.assert.strictEqual(after.groupCount, 0);
  });

  await t.test('keeps the group when other broken records remain', async (t) => {
    const db = freshDb();
    const ctx = makeContext(db);
    const a = insertRow(db, { name: 'gone-a.jpg', status: 'error', hash: 'same', exists: false });
    const b = insertRow(db, { name: 'gone-b.jpg', status: 'error', hash: 'same', exists: false });
    insertRow(db, { name: 'here.jpg', hash: 'same' });

    await startHealthScan(ctx[0], ctx[1]);
    removeFromFailedSnapshot(ctx[0], [a]);
    const after = callOp(listFailed, ctx, { countOnly: true });
    t.assert.strictEqual(after.failedCount, 1);
    t.assert.strictEqual(after.groupCount, 1);
    const group = callOp(listFailed, ctx).groups[0];
    t.assert.deepStrictEqual(group.failedIds, [b]);
    t.assert.strictEqual(group.siblingCount, 1);
  });

  await t.test('is a no-op for ids that are not in the snapshot', async (t) => {
    const db = freshDb();
    const ctx = makeContext(db);
    insertRow(db, { name: 'gone.jpg', status: 'error', hash: 'x', exists: false });
    await startHealthScan(ctx[0], ctx[1]);

    t.assert.strictEqual(removeFromFailedSnapshot(ctx[0], [999999]), false);
    t.assert.strictEqual(callOp(listFailed, ctx, { countOnly: true }).failedCount, 1);
  });
});

test('repairFailed op', async (t) => {
  let root;
  t.beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-test-')); });
  t.afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  /** Insert a media row. `exists`/`transcodedExists` control what is on disk. */
  function insertRow(db, { name, type = 'video', status = 'error', hash = null, exists = true, transcodedExists = false }) {
    const filePath = path.join(root, name);
    if (exists) writeFixtureFile(root, name, name);
    const transcoded = transcodedExists ? path.join(root, `tc-${name}.mp4`) : null;
    if (transcoded) writeFixtureFile(root, `tc-${name}.mp4`, 'transcoded');
    const { lastInsertRowid: id } = db.prepare(
      'INSERT INTO media (path, title, type, status, hash, transcoded_path) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(filePath, name, type, status, hash, transcoded);
    return id;
  }

  await t.test('restores a record whose transcoded output exists', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);
    const id = insertRow(db, { name: 'video.webm', exists: false, transcodedExists: true });

    const result = callOp(repairFailed, ctx, { ids: [id] });

    t.assert.strictEqual(result.repaired, 1);
    t.assert.strictEqual(result.restored, 1);
    t.assert.strictEqual(result.requeued, 0);
    t.assert.strictEqual(result.results[0].reason, 'transcoded');
    t.assert.strictEqual(db.prepare('SELECT status FROM media WHERE id = ?').get(id).status, 'ready');
  });

  await t.test('restores an image whose original exists', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);
    const id = insertRow(db, { name: 'photo.jpg', type: 'image' });

    const result = callOp(repairFailed, ctx, { ids: [id] });

    t.assert.strictEqual(result.restored, 1);
    t.assert.strictEqual(db.prepare('SELECT status FROM media WHERE id = ?').get(id).status, 'ready');
  });

  await t.test('re-queues a video whose original exists', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);
    const queued = [];
    ctx[0].ops.transcodeNow = (id) => { queued.push(id); return 1; };
    const id = insertRow(db, { name: 'video.avi' });

    const result = callOp(repairFailed, ctx, { ids: [id] });

    t.assert.strictEqual(result.repaired, 1);
    t.assert.strictEqual(result.requeued, 1);
    t.assert.deepStrictEqual(queued, [id]);
    t.assert.strictEqual(db.prepare('SELECT status FROM media WHERE id = ?').get(id).status, 'pending');
  });

  await t.test('reports a record with no file on disk as unrepairable', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);
    const id = insertRow(db, { name: 'gone.webm', exists: false });

    const result = callOp(repairFailed, ctx, { ids: [id] });

    t.assert.strictEqual(result.repaired, 0);
    t.assert.strictEqual(result.unrepairable, 1);
    t.assert.strictEqual(result.results[0].outcome, 'unrepairable');
    t.assert.strictEqual(db.prepare('SELECT status FROM media WHERE id = ?').get(id).status, 'error');
  });

  await t.test('repairs every failed record with all: true', async (t) => {
    const db = freshDb();
    const ctx = makeContext(db);
    insertRow(db, { name: 'good.webm', exists: false, transcodedExists: true });
    insertRow(db, { name: 'bad.webm', exists: false });
    insertRow(db, { name: 'ok.webm', status: 'ready', exists: true });

    await startHealthScan(ctx[0], ctx[1]);
    const result = callOp(repairFailed, ctx, { all: true });

    t.assert.strictEqual(result.repaired, 1);
    t.assert.strictEqual(result.unrepairable, 1);
  });

  await t.test('ignores hidden media when repairing all', async (t) => {
    const db = freshDb();
    const ctx = makeContext(db);
    const id = insertRow(db, { name: 'hidden.webm', exists: false, transcodedExists: true });
    db.prepare('UPDATE media SET hidden = 1 WHERE id = ?').run(id);

    await startHealthScan(ctx[0], ctx[1]);
    const result = callOp(repairFailed, ctx, { all: true });

    t.assert.strictEqual(result.repaired, 0);
    t.assert.strictEqual(db.prepare('SELECT status FROM media WHERE id = ?').get(id).status, 'error');
  });
});

test('getMediaDuplicates op', async (t) => {
  let root;
  t.beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicates-test-')); });
  t.afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  function insertWithHash(db, name, hash, title = 'Test') {
    const filePath = writeFixtureFile(root, path.basename(name), hash);
    const { lastInsertRowid: id } = db.prepare(
      "INSERT INTO media (path, title, status, hash) VALUES (?, ?, 'pending', ?)"
    ).run(filePath, title, hash);
    return id;
  }

  await t.test('returns an empty result for an item without duplicates', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);
    const only = insertWithHash(db, '/only.jpg', 'solo');

    const result = callOp(getMediaDuplicates, ctx, only);
    t.assert.strictEqual(result.count, 0);
    t.assert.deepStrictEqual(result.ids, []);
  });

  await t.test('returns every copy for a duplicated item', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);
    const a = insertWithHash(db, '/a.jpg', 'same');
    const b = insertWithHash(db, '/b.jpg', 'same');
    insertWithHash(db, '/other.jpg', 'other');

    const result = callOp(getMediaDuplicates, ctx, a);
    t.assert.strictEqual(result.count, 2);
    t.assert.deepStrictEqual([...result.ids].sort((x, y) => x - y), [a, b]);
    t.assert.strictEqual(result.items.length, 2);
  });

  await t.test('excludes hidden copies', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);
    const a = insertWithHash(db, '/a.jpg', 'same');
    const b = insertWithHash(db, '/b.jpg', 'same');
    db.prepare('UPDATE media SET hidden = 1 WHERE id = ?').run(b);

    const result = callOp(getMediaDuplicates, ctx, a);
    t.assert.strictEqual(result.count, 0);
  });

  await t.test('returns an empty result for a missing item', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);

    const result = callOp(getMediaDuplicates, ctx, 999);
    t.assert.strictEqual(result.count, 0);
  });
});

test('mergeDuplicates op', async (t) => {
  let root;
  t.beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicates-test-')); });
  t.afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  function seedGroup(db) {
    /* A=latest, B=earliest (so B is master), C=middle-but-most-liked. */
    const bPath = writeFixtureFile(root, 'b.jpg', 'same');
    const aPath = writeFixtureFile(root, 'a.jpg', 'same');
    const cPath = writeFixtureFile(root, 'c.jpg', 'same');
    const b = db.prepare(
      "INSERT INTO media (path, title, status, hash, tags, likes, created_at) VALUES (?, 'B', 'ready', 'same', '[\"b\",\"a\"]', 2, '2020-01-01')"
    ).run(bPath).lastInsertRowid;
    const a = db.prepare(
      "INSERT INTO media (path, title, status, hash, tags, likes, created_at) VALUES (?, 'A', 'ready', 'same', '[\"a\"]', 5, '2023-01-01')"
    ).run(aPath).lastInsertRowid;
    const c = db.prepare(
      "INSERT INTO media (path, title, status, hash, tags, likes, created_at) VALUES (?, 'C', 'ready', 'same', '[\"c\"]', 30, '2021-01-01')"
    ).run(cPath).lastInsertRowid;
    return { b, a, c };
  }

  await t.test('keeps the earliest-created master and absorbs tags + likes', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);
    const { b, a, c } = seedGroup(db);

    const result = callOp(mergeDuplicates, ctx, { ids: [b, a, c] });

    t.assert.strictEqual(result.merged, 2);
    t.assert.strictEqual(result.deletedFiles, 2);
    /* Master is B — earliest created_at. */
    t.assert.strictEqual(result.media.id, b);
    t.assert.strictEqual(result.media.title, 'B');
    /* likes = 2 (B) + 5 (A) + 30 (C) = 37. */
    t.assert.strictEqual(result.media.likes, 37);
    t.assert.deepStrictEqual([...result.media.tags].sort(), ['a', 'b', 'c']);
    /* The removed copies' ids are reported so the client can clear its cache. */
    t.assert.deepStrictEqual([...result.removedIds].sort((x, y) => x - y), [a, c]);
    /* Removed records are gone; the master survives. */
    t.assert.strictEqual(callOp(getMediaById, ctx, a), null);
    t.assert.strictEqual(callOp(getMediaById, ctx, c), null);
    t.assert.strictEqual(callOp(getMediaById, ctx, b).id, b);
  });

  await t.test('breaks ties by most likes when created_at is equal', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);
    const lowPath = writeFixtureFile(root, 'low.jpg', 'same');
    const highPath = writeFixtureFile(root, 'high.jpg', 'same');
    const low = db.prepare(
      "INSERT INTO media (path, title, status, hash, tags, likes, created_at) VALUES (?, 'Low', 'ready', 'same', '[\"a\"]', 1, '2021-01-01')"
    ).run(lowPath).lastInsertRowid;
    const high = db.prepare(
      "INSERT INTO media (path, title, status, hash, tags, likes, created_at) VALUES (?, 'High', 'ready', 'same', '[\"b\"]', 9, '2021-01-01')"
    ).run(highPath).lastInsertRowid;

    const result = callOp(mergeDuplicates, ctx, { ids: [low, high] });
    t.assert.strictEqual(result.media.id, high);
    t.assert.strictEqual(result.media.likes, 10);
    t.assert.strictEqual(callOp(getMediaById, ctx, low), null);
  });

  await t.test('returns 400 for fewer than two selected records', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);
    db.prepare("INSERT INTO media (path, title, status, hash) VALUES ('/only.jpg', 'Only', 'ready', 'same')").run();

    const result = callOp(mergeDuplicates, ctx, { ids: [1] });
    t.assert.strictEqual(result.status, 400);
  });

  await t.test('validates required fields', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);
    t.assert.strictEqual(callOp(mergeDuplicates, ctx, {}).status, 400);
  });

  await t.test('preserves a removed duplicate as a folder thumbnail', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);
    const { b, a, c } = seedGroup(db);
    db.prepare('INSERT INTO folders (path, thumbnail_media_id, thumbnail_time) VALUES (?, ?, ?)')
      .run(root, a, 12.5);

    callOp(mergeDuplicates, ctx, { ids: [b, a, c] });

    const folder = db.prepare('SELECT thumbnail_media_id, thumbnail_time FROM folders WHERE path = ?').get(root);
    t.assert.strictEqual(folder.thumbnail_media_id, b);
    t.assert.strictEqual(folder.thumbnail_time, 12.5);
  });

  await t.test('merges a group whose files are all missing from disk', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);
    const missingA = db.prepare(
      "INSERT INTO media (path, title, status, hash, likes, created_at) VALUES (?, 'A', 'ready', 'same', 3, '2020-01-01')"
    ).run(path.join(root, 'gone-a.jpg')).lastInsertRowid;
    const missingB = db.prepare(
      "INSERT INTO media (path, title, status, hash, likes, created_at) VALUES (?, 'B', 'ready', 'same', 1, '2023-01-01')"
    ).run(path.join(root, 'gone-b.jpg')).lastInsertRowid;

    const result = callOp(mergeDuplicates, ctx, { ids: [missingA, missingB] });

    t.assert.strictEqual(result.merged, 1);
    /* Earliest created_at still wins when nothing is verifiable. */
    t.assert.strictEqual(result.media.id, missingA);
    t.assert.deepStrictEqual(result.removedIds, [missingB]);
    t.assert.strictEqual(callOp(getMediaById, ctx, missingB), null);
    t.assert.strictEqual(callOp(getMediaById, ctx, missingA).id, missingA);
  });

  await t.test('keeps an existing file as master when a copy is missing', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);
    const existingPath = writeFixtureFile(root, 'present.jpg', 'same');
    /* Earliest created_at is the missing record, but it must not become master. */
    const missing = db.prepare(
      "INSERT INTO media (path, title, status, hash, created_at) VALUES (?, 'Gone', 'ready', 'same', '2019-01-01')"
    ).run(path.join(root, 'gone.jpg')).lastInsertRowid;
    const present = db.prepare(
      "INSERT INTO media (path, title, status, hash, created_at) VALUES (?, 'Here', 'ready', 'same', '2024-01-01')"
    ).run(existingPath).lastInsertRowid;

    const result = callOp(mergeDuplicates, ctx, { ids: [missing, present] });

    t.assert.strictEqual(result.media.id, present);
    t.assert.strictEqual(callOp(getMediaById, ctx, missing), null);
    t.assert.ok(fs.existsSync(existingPath));
  });

  await t.test('keeps an explicitly requested record as master', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);
    const { b, a, c } = seedGroup(db);

    /* Without keepId the earliest-created B wins; ask for A instead. */
    const result = callOp(mergeDuplicates, ctx, { ids: [b, a, c], keepId: a });

    t.assert.strictEqual(result.media.id, a);
    t.assert.strictEqual(result.media.title, 'A');
    /* likes = 2 (B) + 5 (A) + 30 (C) = 37. */
    t.assert.strictEqual(result.media.likes, 37);
    t.assert.deepStrictEqual([...result.media.tags].sort(), ['a', 'b', 'c']);
    t.assert.deepStrictEqual([...result.removedIds].sort((x, y) => x - y), [b, c]);
  });

  await t.test('does not keep a requested record whose file is missing when a copy survives', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);
    const existingPath = writeFixtureFile(root, 'present.jpg', 'same');
    const missing = db.prepare(
      "INSERT INTO media (path, title, status, hash, created_at) VALUES (?, 'Gone', 'ready', 'same', '2019-01-01')"
    ).run(path.join(root, 'gone.jpg')).lastInsertRowid;
    const present = db.prepare(
      "INSERT INTO media (path, title, status, hash, created_at) VALUES (?, 'Here', 'ready', 'same', '2024-01-01')"
    ).run(existingPath).lastInsertRowid;

    /* keepId asks for the missing record, but the surviving file must win so it
       is not deleted from disk. */
    const result = callOp(mergeDuplicates, ctx, { ids: [missing, present], keepId: missing });

    t.assert.strictEqual(result.media.id, present);
    t.assert.ok(fs.existsSync(existingPath));
    t.assert.strictEqual(callOp(getMediaById, ctx, missing), null);
  });

  await t.test('falls back to the maturity winner when keepId is not in the group', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);
    const { b, a, c } = seedGroup(db);

    const result = callOp(mergeDuplicates, ctx, { ids: [b, a, c], keepId: 9999 });

    t.assert.strictEqual(result.media.id, b);
  });

  await t.test('rejects when surviving files differ', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);
    const onePath = writeFixtureFile(root, 'one.jpg', 'one');
    const twoPath = writeFixtureFile(root, 'two.jpg', 'two');
    const a = db.prepare("INSERT INTO media (path, title, status, hash) VALUES (?, 'One', 'ready', 'same')").run(onePath).lastInsertRowid;
    const b = db.prepare("INSERT INTO media (path, title, status, hash) VALUES (?, 'Two', 'ready', 'same')").run(twoPath).lastInsertRowid;

    const result = callOp(mergeDuplicates, ctx, { ids: [a, b] });

    t.assert.strictEqual(result.status, 400);
    t.assert.ok(callOp(getMediaById, ctx, a));
    t.assert.ok(callOp(getMediaById, ctx, b));
  });
});

test('deleteDuplicates op', async (t) => {
  let root;
  t.beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicates-test-')); });
  t.afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  await t.test('deletes every record in the group', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);
    const aPath = writeFixtureFile(root, 'a.jpg', 'same');
    const bPath = writeFixtureFile(root, 'b.jpg', 'same');
    const a = db.prepare("INSERT INTO media (path, title, status, hash) VALUES (?, 'A', 'ready', 'same')").run(aPath).lastInsertRowid;
    const b = db.prepare("INSERT INTO media (path, title, status, hash) VALUES (?, 'B', 'ready', 'same')").run(bPath).lastInsertRowid;

    const result = callOp(deleteDuplicates, ctx, { ids: [a, b] });

    t.assert.strictEqual(result.deleted, 2);
    t.assert.strictEqual(result.deletedFiles, 2);
    t.assert.deepStrictEqual([...result.removedIds].sort((x, y) => x - y), [a, b]);
    t.assert.strictEqual(callOp(getMediaById, ctx, a), null);
    t.assert.strictEqual(callOp(getMediaById, ctx, b), null);
  });

  await t.test('validates required fields', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);
    t.assert.strictEqual(callOp(deleteDuplicates, ctx, {}).status, 400);
  });

  await t.test('rejects a stale singleton selection', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);
    const filePath = writeFixtureFile(root, 'only.jpg', 'same');
    const id = db.prepare("INSERT INTO media (path, title, status, hash) VALUES (?, 'Only', 'ready', 'same')").run(filePath).lastInsertRowid;

    const result = callOp(deleteDuplicates, ctx, { ids: [id] });
    t.assert.strictEqual(result.status, 400);
    t.assert.ok(callOp(getMediaById, ctx, id));
  });

  await t.test('deletes a group whose files are missing from disk', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);
    const a = db.prepare("INSERT INTO media (path, title, status, hash) VALUES (?, 'A', 'ready', 'same')").run(path.join(root, 'gone-a.jpg')).lastInsertRowid;
    const b = db.prepare("INSERT INTO media (path, title, status, hash) VALUES (?, 'B', 'ready', 'same')").run(path.join(root, 'gone-b.jpg')).lastInsertRowid;

    const result = callOp(deleteDuplicates, ctx, { ids: [a, b] });

    t.assert.strictEqual(result.deleted, 2);
    t.assert.deepStrictEqual([...result.removedIds].sort((x, y) => x - y), [a, b]);
    t.assert.strictEqual(callOp(getMediaById, ctx, a), null);
    t.assert.strictEqual(callOp(getMediaById, ctx, b), null);
  });
});

test('getMediaById op', async (t) => {
  await t.test('returns the matching row', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);

    const id = insertMedia(db, '/test.mp4', 'Test Video');
    const row = callOp(getMediaById, ctx, id);

    t.assert.strictEqual(row.id, id);
    t.assert.strictEqual(row.title, 'Test Video');
    t.assert.strictEqual(row.path, '/test.mp4');
  });

  await t.test('returns null for a non-existent id', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);

    const row = callOp(getMediaById, ctx, 9999);
    t.assert.strictEqual(row, null);
  });
});

test('likeMedia op', async (t) => {
  await t.test('returns likedCount on first like', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);

    const id = insertMedia(db, '/like.jpg', 'Like');
    const result = callOp(likeMedia, ctx, id);

    t.assert.strictEqual(result.likes, 1);
    t.assert.strictEqual(result.likedCount, 1);
  });

  await t.test('omits likedCount when re-liking an already-liked item', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);

    const id = insertMedia(db, '/like.jpg', 'Like');
    callOp(likeMedia, ctx, id);

    const result = callOp(likeMedia, ctx, id);

    t.assert.strictEqual(result.likes, 2);
    t.assert.strictEqual('likedCount' in result, false);
  });

  await t.test('returns null for a non-existent id', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);

    t.assert.strictEqual(callOp(likeMedia, ctx, 9999), null);
  });
});

test('updateTags op', async (t) => {
  await t.test('sets tags and returns tagCount', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);

    const id = insertMedia(db, '/tag.jpg', 'Tag');
    const result = callOp(updateTags, ctx, id, ['nature']);

    t.assert.deepStrictEqual(result.tags, ['nature']);
    t.assert.strictEqual(result.tagCount, 1);
  });

  await t.test('counts distinct tags across media', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);

    const a = insertMedia(db, '/a.jpg', 'A');
    const b = insertMedia(db, '/b.jpg', 'B');

    callOp(updateTags, ctx, a, ['nature', 'city']);
    const result = callOp(updateTags, ctx, b, ['city']);

    t.assert.strictEqual(result.tagCount, 2);
  });

  await t.test('returns null for a non-existent id', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);

    t.assert.strictEqual(callOp(updateTags, ctx, 9999, ['x']), null);
  });
});

test('removeMedia op', async (t) => {
  await t.test('deletes an existing row and returns deleted: true', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);

    const id = insertMedia(db, '/rm.mp4');
    const result = callOp(removeMedia, ctx, id);

    t.assert.strictEqual(result.deleted, true);
    /* Verify it is gone. */
    t.assert.strictEqual(callOp(getMediaById, ctx, id), null);
  });

  await t.test('returns deleted: false for a non-existent id', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);

    const result = callOp(removeMedia, ctx, 9999);
    t.assert.strictEqual(result.deleted, false);
  });

  await t.test('cascades to delete associated jobs', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);

    const id = insertMedia(db, '/cascade.mp4');
    db.prepare("INSERT INTO jobs (media_id, type, status) VALUES (?, 'probe', 'pending')").run(id);

    callOp(removeMedia, ctx, id);

    /* Jobs should be gone too (ON DELETE CASCADE). */
    const { c: count } = db.prepare('SELECT COUNT(*) as c FROM jobs WHERE media_id = ?').get(id);

    t.assert.strictEqual(count, 0);
  });
});

