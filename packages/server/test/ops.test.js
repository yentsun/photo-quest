/**
 * @file Tests for kojo ops -- uses an in-memory sql.js database.
 *
 * Each test creates a fresh database so they are fully isolated.
 * Ops receive `[kojo, logger]` via `this`, so we build a minimal
 * kojo-like object that holds state and exposes .get()/.set().
 */

import test from 'node:test';
import initSqlJs from 'sql.js';
import { CREATE_MEDIA_TABLE, CREATE_JOBS_TABLE } from '@photo-quest/shared';

/* Import the raw op functions. */
import listMedia from '../ops/listMedia.js';
import getMediaById from '../ops/getMediaById.js';
import removeMedia from '../ops/removeMedia.js';
/*
 * listJobs is not imported here because it calls reloadDb() which depends
 * on the module-level sql.js singleton from src/db.js. Instead we test
 * the jobs query logic directly below.
 */

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

let SQL;

/** Initialise sql.js WASM once for the entire test file. */
async function ensureSql() {
  if (!SQL) SQL = await initSqlJs();
}

/** Create a fresh in-memory database with the schema applied. */
function freshDb() {
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');
  db.run(CREATE_MEDIA_TABLE);
  db.run(CREATE_JOBS_TABLE);
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
  };

  return [kojo, logger];
}

/** Call an op with the fake kojo context. */
function callOp(op, ctx, ...args) {
  return op.apply(ctx, args);
}

/** Insert a media row directly and return its id. */
function insertMedia(db, filePath, title = 'Test') {
  db.run("INSERT INTO media (path, title, status) VALUES (?, ?, 'pending')", [filePath, title]);
  const stmt = db.prepare('SELECT last_insert_rowid() as id');
  stmt.step();
  const id = stmt.getAsObject().id;
  stmt.free();
  return id;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

test('listMedia op', async (t) => {
  await ensureSql();

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

test('getMediaById op', async (t) => {
  await ensureSql();

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

test('removeMedia op', async (t) => {
  await ensureSql();

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
    db.run("INSERT INTO jobs (media_id, type, status) VALUES (?, 'probe', 'pending')", [id]);

    callOp(removeMedia, ctx, id);

    /* Jobs should be gone too (ON DELETE CASCADE). */
    const stmt = db.prepare('SELECT COUNT(*) as c FROM jobs WHERE media_id = ?');
    stmt.bind([id]);
    stmt.step();
    const count = stmt.getAsObject().c;
    stmt.free();

    t.assert.strictEqual(count, 0);
  });
});

test('jobs query logic', async (t) => {
  await ensureSql();

  /** Run the same query that listJobs op uses internally. */
  function queryJobs(db) {
    const stmt = db.prepare('SELECT * FROM jobs ORDER BY created_at DESC');
    const results = [];
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();
    return results;
  }

  await t.test('returns empty array when no jobs exist', (t) => {
    const db = freshDb();
    t.assert.deepStrictEqual(queryJobs(db), []);
  });

  await t.test('returns all jobs for a media record', (t) => {
    const db = freshDb();
    const mediaId = insertMedia(db, '/j.mp4');
    db.run("INSERT INTO jobs (media_id, type, status) VALUES (?, 'probe', 'pending')", [mediaId]);
    db.run("INSERT INTO jobs (media_id, type, status) VALUES (?, 'transcode', 'pending')", [mediaId]);

    const result = queryJobs(db);
    t.assert.strictEqual(result.length, 2);
    const types = result.map(r => r.type).sort();
    t.assert.deepStrictEqual(types, ['probe', 'transcode']);
  });
});
