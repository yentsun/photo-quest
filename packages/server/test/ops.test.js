/**
 * @file Tests for kojo ops -- uses an in-memory better-sqlite3 database.
 *
 * Each test creates a fresh database so they are fully isolated.
 * Ops receive `[kojo, logger]` via `this`, so we build a minimal
 * kojo-like object that holds state and exposes .get()/.set().
 */

import test from 'node:test';
import { DatabaseSync as Database } from 'node:sqlite';
import { CREATE_MEDIA_TABLE, CREATE_JOBS_TABLE } from '@photo-quest/shared';

/* Import the raw op functions. */
import listMedia from '../ops/listMedia.js';
import listDuplicates from '../ops/listDuplicates.js';
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
  function insertWithHash(db, filePath, hash, title = 'Test') {
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
    t.assert.strictEqual(group.hash, 'same');
    t.assert.strictEqual(group.count, 3);
    t.assert.strictEqual(group.items.length, 3);
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
});

test('mergeDuplicates op', async (t) => {
  function seedGroup(db) {
    /* A=latest, B=earliest (so B is master), C=middle-but-most-liked. */
    const b = db.prepare(
      "INSERT INTO media (path, title, status, hash, tags, likes, created_at) VALUES ('/b.jpg', 'B', 'ready', 'same', '[\"b\",\"a\"]', 2, '2020-01-01')"
    ).run().lastInsertRowid;
    const a = db.prepare(
      "INSERT INTO media (path, title, status, hash, tags, likes, created_at) VALUES ('/a.jpg', 'A', 'ready', 'same', '[\"a\"]', 5, '2023-01-01')"
    ).run().lastInsertRowid;
    const c = db.prepare(
      "INSERT INTO media (path, title, status, hash, tags, likes, created_at) VALUES ('/c.jpg', 'C', 'ready', 'same', '[\"c\"]', 30, '2021-01-01')"
    ).run().lastInsertRowid;
    return { b, a, c };
  }

  await t.test('keeps the earliest-created master and absorbs tags + likes', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);
    const { b, a, c } = seedGroup(db);

    const result = callOp(mergeDuplicates, ctx, { hash: 'same' });

    t.assert.strictEqual(result.merged, 2);
    t.assert.strictEqual(result.deletedFiles, 2);
    /* Master is B — earliest created_at. */
    t.assert.strictEqual(result.media.id, b);
    t.assert.strictEqual(result.media.title, 'B');
    /* likes = 2 (B) + 5 (A) + 30 (C) = 37. */
    t.assert.strictEqual(result.media.likes, 37);
    t.assert.deepStrictEqual([...result.media.tags].sort(), ['a', 'b', 'c']);
    /* Removed records are gone; the master survives. */
    t.assert.strictEqual(callOp(getMediaById, ctx, a), null);
    t.assert.strictEqual(callOp(getMediaById, ctx, c), null);
    t.assert.strictEqual(callOp(getMediaById, ctx, b).id, b);
  });

  await t.test('breaks ties by most likes when created_at is equal', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);
    const low = db.prepare(
      "INSERT INTO media (path, title, status, hash, tags, likes, created_at) VALUES ('/low.jpg', 'Low', 'ready', 'same', '[\"a\"]', 1, '2021-01-01')"
    ).run().lastInsertRowid;
    const high = db.prepare(
      "INSERT INTO media (path, title, status, hash, tags, likes, created_at) VALUES ('/high.jpg', 'High', 'ready', 'same', '[\"b\"]', 9, '2021-01-01')"
    ).run().lastInsertRowid;

    const result = callOp(mergeDuplicates, ctx, { hash: 'same' });
    t.assert.strictEqual(result.media.id, high);
    t.assert.strictEqual(result.media.likes, 10);
    t.assert.strictEqual(callOp(getMediaById, ctx, low), null);
  });

  await t.test('returns 400 for a hash with fewer than two records', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);
    db.prepare("INSERT INTO media (path, title, status, hash) VALUES ('/only.jpg', 'Only', 'ready', 'same')").run();

    const result = callOp(mergeDuplicates, ctx, { hash: 'same' });
    t.assert.strictEqual(result.status, 400);
  });

  await t.test('validates required fields', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);
    t.assert.strictEqual(callOp(mergeDuplicates, ctx, {}).status, 400);
  });
});

test('deleteDuplicates op', async (t) => {
  await t.test('deletes every record in the group', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);
    const a = db.prepare("INSERT INTO media (path, title, status, hash) VALUES ('/a.jpg', 'A', 'ready', 'same')").run().lastInsertRowid;
    const b = db.prepare("INSERT INTO media (path, title, status, hash) VALUES ('/b.jpg', 'B', 'ready', 'same')").run().lastInsertRowid;

    const result = callOp(deleteDuplicates, ctx, { hash: 'same' });

    t.assert.strictEqual(result.deleted, 2);
    t.assert.strictEqual(result.deletedFiles, 2);
    t.assert.strictEqual(callOp(getMediaById, ctx, a), null);
    t.assert.strictEqual(callOp(getMediaById, ctx, b), null);
  });

  await t.test('validates required fields', (t) => {
    const db = freshDb();
    const ctx = makeContext(db);
    t.assert.strictEqual(callOp(deleteDuplicates, ctx, {}).status, 400);
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

