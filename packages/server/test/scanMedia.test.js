/**
 * @file Unit tests for the scanMedia op — specifically recursive directory walking.
 */

import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import initSqlJs from 'sql.js';
import { CREATE_MEDIA_TABLE, CREATE_JOBS_TABLE } from '@photo-quest/shared';
import scanMedia from '../ops/scanMedia.js';

/** Create a temp directory tree with nested folders and media files. */
function createFixtureTree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-test-'));

  // root/photo.jpg
  fs.writeFileSync(path.join(root, 'photo.jpg'), 'jpg-data-root');

  // root/video.mp4
  fs.writeFileSync(path.join(root, 'video.mp4'), 'mp4-data-root');

  // root/subdir/nested.png
  fs.mkdirSync(path.join(root, 'subdir'));
  fs.writeFileSync(path.join(root, 'subdir', 'nested.png'), 'png-data-sub');

  // root/subdir/deep/deep_clip.mkv
  fs.mkdirSync(path.join(root, 'subdir', 'deep'));
  fs.writeFileSync(path.join(root, 'subdir', 'deep', 'deep_clip.mkv'), 'mkv-data-deep');

  // root/other/family.jpeg
  fs.mkdirSync(path.join(root, 'other'));
  fs.writeFileSync(path.join(root, 'other', 'family.jpeg'), 'jpeg-data-other');

  // root/readme.txt  — should be ignored
  fs.writeFileSync(path.join(root, 'readme.txt'), 'not media');

  return root;
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

let SQL;

async function makeDb() {
  if (!SQL) SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');
  db.run(CREATE_MEDIA_TABLE);
  db.run(CREATE_JOBS_TABLE);
  return db;
}

function bindScanMedia(db) {
  const kojo = {
    get(key) {
      if (key === 'db') return db;
    },
  };
  const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
  return scanMedia.bind([kojo, logger]);
}

/** Query all media rows from the db. */
function allMedia(db) {
  const stmt = db.prepare('SELECT * FROM media ORDER BY path');
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

test('scanMedia — recursive directory walking', async (t) => {
  let root;

  t.beforeEach(() => { root = createFixtureTree(); });
  t.afterEach(() => { cleanup(root); });

  await t.test('finds files in nested subdirectories', async () => {
    const db = await makeDb();
    const scan = bindScanMedia(db);

    const result = scan(root);

    t.assert.strictEqual(result.scanned, 5);
    t.assert.strictEqual(result.added, 5);

    const rows = allMedia(db);
    const titles = rows.map(r => r.title).sort();
    t.assert.deepStrictEqual(titles, ['deep_clip', 'family', 'nested', 'photo', 'video']);
  });

  await t.test('records correct folder for nested files', async () => {
    const db = await makeDb();
    const scan = bindScanMedia(db);
    scan(root);

    const rows = allMedia(db);
    const byTitle = Object.fromEntries(rows.map(r => [r.title, r]));

    t.assert.strictEqual(byTitle.photo.folder, root);
    t.assert.strictEqual(byTitle.nested.folder, path.join(root, 'subdir'));
    t.assert.strictEqual(byTitle.deep_clip.folder, path.join(root, 'subdir', 'deep'));
    t.assert.strictEqual(byTitle.family.folder, path.join(root, 'other'));
  });

  await t.test('ignores non-media files', async () => {
    const db = await makeDb();
    const scan = bindScanMedia(db);
    scan(root);

    const rows = allMedia(db);
    const paths = rows.map(r => r.path);
    const hasTxt = paths.some(p => p.endsWith('.txt'));
    t.assert.strictEqual(hasTxt, false);
  });

  await t.test('sets correct type for images vs videos', async () => {
    const db = await makeDb();
    const scan = bindScanMedia(db);
    scan(root);

    const rows = allMedia(db);
    const byTitle = Object.fromEntries(rows.map(r => [r.title, r]));

    t.assert.strictEqual(byTitle.photo.type, 'image');
    t.assert.strictEqual(byTitle.nested.type, 'image');
    t.assert.strictEqual(byTitle.family.type, 'image');
    t.assert.strictEqual(byTitle.video.type, 'video');
    t.assert.strictEqual(byTitle.deep_clip.type, 'video');
  });

  await t.test('creates probe jobs only for videos', async () => {
    const db = await makeDb();
    const scan = bindScanMedia(db);
    scan(root);

    const stmt = db.prepare('SELECT j.type, m.title FROM jobs j JOIN media m ON j.media_id = m.id ORDER BY m.title');
    const jobs = [];
    while (stmt.step()) jobs.push(stmt.getAsObject());
    stmt.free();

    const jobTitles = jobs.map(j => j.title).sort();
    t.assert.deepStrictEqual(jobTitles, ['deep_clip', 'video']);
    for (const job of jobs) {
      t.assert.strictEqual(job.type, 'probe');
    }
  });

  await t.test('does not duplicate on re-scan', async () => {
    const db = await makeDb();
    const scan = bindScanMedia(db);

    scan(root);
    const result2 = scan(root);

    t.assert.strictEqual(result2.added, 0);

    const rows = allMedia(db);
    t.assert.strictEqual(rows.length, 5);
  });
});
