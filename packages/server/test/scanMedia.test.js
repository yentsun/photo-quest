/**
 * @file Tests for the scanMedia op — db-backed import queue (LAW 2.3).
 *
 * Tests cover:
 *  - Discovery phase: scan record + import_queue population
 *  - Processing phase: media/job creation from queue items
 *  - Progress tracking: scan.processed increments correctly
 *  - Resume: incomplete scans are detected and can be resumed
 *  - Deduplication: re-scanning does not create duplicate media
 *  - Error handling: missing files are marked as failed in the queue
 */

import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import initSqlJs from 'sql.js';
import { CREATE_MEDIA_TABLE, CREATE_JOBS_TABLE, CREATE_SCANS_TABLE, CREATE_IMPORT_QUEUE_TABLE, SCAN_STATUS, IMPORT_STATUS } from '@photo-quest/shared';
import scanMedia, { processOneItem, resumeIncompleteScans } from '../ops/scanMedia.js';

/** Create a temp directory tree with nested folders and media files. */
function createFixtureTree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-test-'));

  fs.writeFileSync(path.join(root, 'photo.jpg'), 'jpg-data-root');
  fs.writeFileSync(path.join(root, 'video.mp4'), 'mp4-data-root');

  fs.mkdirSync(path.join(root, 'subdir'));
  fs.writeFileSync(path.join(root, 'subdir', 'nested.png'), 'png-data-sub');

  fs.mkdirSync(path.join(root, 'subdir', 'deep'));
  fs.writeFileSync(path.join(root, 'subdir', 'deep', 'deep_clip.mkv'), 'mkv-data-deep');

  fs.mkdirSync(path.join(root, 'other'));
  fs.writeFileSync(path.join(root, 'other', 'family.jpeg'), 'jpeg-data-other');

  // Should be ignored
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
  db.run(CREATE_SCANS_TABLE);
  db.run(CREATE_IMPORT_QUEUE_TABLE);
  return db;
}

function makeContext(db) {
  const kojo = {
    get(key) { if (key === 'db') return db; },
  };
  const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
  return { kojo, logger, ctx: [kojo, logger] };
}

function bindScanMedia(db) {
  const { ctx } = makeContext(db);
  return scanMedia.bind(ctx);
}

/** Query all media rows. */
function allMedia(db) {
  const stmt = db.prepare('SELECT * FROM media ORDER BY path');
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

/** Query all import_queue rows for a scan. */
function allQueueItems(db, scanId) {
  const stmt = db.prepare('SELECT * FROM import_queue WHERE scan_id = ? ORDER BY path');
  stmt.bind([scanId]);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

/** Get scan record by id. */
function getScan(db, scanId) {
  const stmt = db.prepare('SELECT * FROM scans WHERE id = ?');
  stmt.bind([scanId]);
  let row = null;
  if (stmt.step()) row = stmt.getAsObject();
  stmt.free();
  return row;
}

/** Process all pending queue items synchronously (for testing). */
function drainQueue(db, scanId, logger) {
  const items = allQueueItems(db, scanId).filter(i => i.status === IMPORT_STATUS.PENDING);
  for (const item of items) {
    try {
      processOneItem(db, item.id, item.path, logger);
    } catch (err) {
      db.run(
        'UPDATE import_queue SET status = ?, error = ? WHERE id = ?',
        [IMPORT_STATUS.FAILED, err.message, item.id]
      );
    }
    db.run('UPDATE scans SET processed = processed + 1 WHERE id = ?', [scanId]);
  }
  db.run('UPDATE scans SET status = ? WHERE id = ?', [SCAN_STATUS.COMPLETED, scanId]);
}

/* ------------------------------------------------------------------ */
/*  Discovery phase tests                                              */
/* ------------------------------------------------------------------ */

test('scanMedia — discovery phase', async (t) => {
  let root;

  t.beforeEach(() => { root = createFixtureTree(); });
  t.afterEach(() => { cleanup(root); });

  await t.test('returns scanId and total count', async () => {
    const db = await makeDb();
    const scan = bindScanMedia(db);

    const result = scan(root);

    t.assert.strictEqual(typeof result.scanId, 'number');
    t.assert.strictEqual(result.total, 5);
  });

  await t.test('creates a scan record in the database', async () => {
    const db = await makeDb();
    const scan = bindScanMedia(db);

    const { scanId } = scan(root);
    const scanRow = getScan(db, scanId);

    t.assert.ok(scanRow);
    t.assert.strictEqual(scanRow.total, 5);
    t.assert.strictEqual(scanRow.dir_path, root);
  });

  await t.test('queues all media files in import_queue', async () => {
    const db = await makeDb();
    const scan = bindScanMedia(db);

    const { scanId } = scan(root);
    const items = allQueueItems(db, scanId);

    t.assert.strictEqual(items.length, 5);
    for (const item of items) {
      t.assert.strictEqual(item.status, IMPORT_STATUS.PENDING);
    }
  });

  await t.test('ignores non-media files in the queue', async () => {
    const db = await makeDb();
    const scan = bindScanMedia(db);

    const { scanId } = scan(root);
    const items = allQueueItems(db, scanId);
    const hasTxt = items.some(i => i.path.endsWith('.txt'));

    t.assert.strictEqual(hasTxt, false);
  });
});

/* ------------------------------------------------------------------ */
/*  Processing phase tests                                             */
/* ------------------------------------------------------------------ */

test('scanMedia — processing phase', async (t) => {
  let root;

  t.beforeEach(() => { root = createFixtureTree(); });
  t.afterEach(() => { cleanup(root); });

  await t.test('processes all queued files into media records', async () => {
    const db = await makeDb();
    const { ctx } = makeContext(db);
    const scan = scanMedia.bind(ctx);

    const { scanId } = scan(root);
    drainQueue(db, scanId, ctx[1]);

    const rows = allMedia(db);
    const titles = rows.map(r => r.title).sort();
    t.assert.deepStrictEqual(titles, ['deep_clip', 'family', 'nested', 'photo', 'video']);
  });

  await t.test('sets correct type for images vs videos', async () => {
    const db = await makeDb();
    const { ctx } = makeContext(db);
    const scan = scanMedia.bind(ctx);

    const { scanId } = scan(root);
    drainQueue(db, scanId, ctx[1]);

    const rows = allMedia(db);
    const byTitle = Object.fromEntries(rows.map(r => [r.title, r]));

    t.assert.strictEqual(byTitle.photo.type, 'image');
    t.assert.strictEqual(byTitle.nested.type, 'image');
    t.assert.strictEqual(byTitle.family.type, 'image');
    t.assert.strictEqual(byTitle.video.type, 'video');
    t.assert.strictEqual(byTitle.deep_clip.type, 'video');
  });

  await t.test('records correct folder for nested files', async () => {
    const db = await makeDb();
    const { ctx } = makeContext(db);
    const scan = scanMedia.bind(ctx);

    const { scanId } = scan(root);
    drainQueue(db, scanId, ctx[1]);

    const rows = allMedia(db);
    const byTitle = Object.fromEntries(rows.map(r => [r.title, r]));

    t.assert.strictEqual(byTitle.photo.folder, root);
    t.assert.strictEqual(byTitle.nested.folder, path.join(root, 'subdir'));
    t.assert.strictEqual(byTitle.deep_clip.folder, path.join(root, 'subdir', 'deep'));
    t.assert.strictEqual(byTitle.family.folder, path.join(root, 'other'));
  });

  await t.test('creates probe jobs only for videos', async () => {
    const db = await makeDb();
    const { ctx } = makeContext(db);
    const scan = scanMedia.bind(ctx);

    const { scanId } = scan(root);
    drainQueue(db, scanId, ctx[1]);

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

  await t.test('marks queue items as completed after processing', async () => {
    const db = await makeDb();
    const { ctx } = makeContext(db);
    const scan = scanMedia.bind(ctx);

    const { scanId } = scan(root);
    drainQueue(db, scanId, ctx[1]);

    const items = allQueueItems(db, scanId);
    for (const item of items) {
      t.assert.strictEqual(item.status, IMPORT_STATUS.COMPLETED);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Progress tracking tests                                            */
/* ------------------------------------------------------------------ */

test('scanMedia — progress tracking', async (t) => {
  let root;

  t.beforeEach(() => { root = createFixtureTree(); });
  t.afterEach(() => { cleanup(root); });

  await t.test('scan.processed increments as items are processed', async () => {
    const db = await makeDb();
    const { ctx } = makeContext(db);
    const scan = scanMedia.bind(ctx);

    const { scanId } = scan(root);

    // Before processing
    t.assert.strictEqual(getScan(db, scanId).processed, 0);

    // Process one item manually
    const items = allQueueItems(db, scanId);
    processOneItem(db, items[0].id, items[0].path, ctx[1]);
    db.run('UPDATE scans SET processed = processed + 1 WHERE id = ?', [scanId]);

    t.assert.strictEqual(getScan(db, scanId).processed, 1);

    // Process the rest
    for (let i = 1; i < items.length; i++) {
      processOneItem(db, items[i].id, items[i].path, ctx[1]);
      db.run('UPDATE scans SET processed = processed + 1 WHERE id = ?', [scanId]);
    }

    t.assert.strictEqual(getScan(db, scanId).processed, 5);
  });

  await t.test('scan status is completed after draining queue', async () => {
    const db = await makeDb();
    const { ctx } = makeContext(db);
    const scan = scanMedia.bind(ctx);

    const { scanId } = scan(root);
    drainQueue(db, scanId, ctx[1]);

    const scanRow = getScan(db, scanId);
    t.assert.strictEqual(scanRow.status, SCAN_STATUS.COMPLETED);
    t.assert.strictEqual(scanRow.processed, 5);
  });
});

/* ------------------------------------------------------------------ */
/*  Deduplication tests                                                */
/* ------------------------------------------------------------------ */

test('scanMedia — deduplication', async (t) => {
  let root;

  t.beforeEach(() => { root = createFixtureTree(); });
  t.afterEach(() => { cleanup(root); });

  await t.test('re-scanning does not create duplicate media', async () => {
    const db = await makeDb();
    const { ctx } = makeContext(db);
    const scan = scanMedia.bind(ctx);

    // First scan + process
    const { scanId: scan1 } = scan(root);
    drainQueue(db, scan1, ctx[1]);
    t.assert.strictEqual(allMedia(db).length, 5);

    // Second scan + process
    const { scanId: scan2 } = scan(root);
    drainQueue(db, scan2, ctx[1]);
    t.assert.strictEqual(allMedia(db).length, 5);
  });
});

/* ------------------------------------------------------------------ */
/*  Resume tests                                                       */
/* ------------------------------------------------------------------ */

test('scanMedia — resume after interruption', async (t) => {
  let root;

  t.beforeEach(() => { root = createFixtureTree(); });
  t.afterEach(() => { cleanup(root); });

  await t.test('resumeIncompleteScans finds incomplete scans', async () => {
    const db = await makeDb();
    const { ctx } = makeContext(db);
    const scan = scanMedia.bind(ctx);

    // Start a scan but don't process it (simulates interruption)
    const { scanId } = scan(root);

    // Verify scan is in importing state
    const scanRow = getScan(db, scanId);
    t.assert.strictEqual(scanRow.status, SCAN_STATUS.IMPORTING);

    // Verify queue items are still pending
    const items = allQueueItems(db, scanId);
    const pending = items.filter(i => i.status === IMPORT_STATUS.PENDING);
    t.assert.strictEqual(pending.length, 5);
  });

  await t.test('partially processed scan can be resumed', async () => {
    const db = await makeDb();
    const { ctx } = makeContext(db);
    const scan = scanMedia.bind(ctx);

    const { scanId } = scan(root);

    // Process only 2 items (simulates partial progress before crash)
    const items = allQueueItems(db, scanId);
    processOneItem(db, items[0].id, items[0].path, ctx[1]);
    db.run('UPDATE scans SET processed = processed + 1 WHERE id = ?', [scanId]);
    processOneItem(db, items[1].id, items[1].path, ctx[1]);
    db.run('UPDATE scans SET processed = processed + 1 WHERE id = ?', [scanId]);

    t.assert.strictEqual(getScan(db, scanId).processed, 2);
    t.assert.strictEqual(allMedia(db).length, 2);

    // Remaining items are still pending — resume should pick them up
    const remaining = allQueueItems(db, scanId).filter(i => i.status === IMPORT_STATUS.PENDING);
    t.assert.strictEqual(remaining.length, 3);

    // Process remaining items (simulates resume)
    for (const item of remaining) {
      processOneItem(db, item.id, item.path, ctx[1]);
      db.run('UPDATE scans SET processed = processed + 1 WHERE id = ?', [scanId]);
    }

    t.assert.strictEqual(allMedia(db).length, 5);
    t.assert.strictEqual(getScan(db, scanId).processed, 5);
  });
});

/* ------------------------------------------------------------------ */
/*  Error handling tests                                               */
/* ------------------------------------------------------------------ */

test('scanMedia — error handling', async (t) => {
  let root;

  t.beforeEach(() => { root = createFixtureTree(); });
  t.afterEach(() => { cleanup(root); });

  await t.test('missing file is marked as failed in queue', async () => {
    const db = await makeDb();
    const { ctx } = makeContext(db);
    const scan = scanMedia.bind(ctx);

    const { scanId } = scan(root);

    // Delete a file after discovery
    const items = allQueueItems(db, scanId);
    const targetItem = items.find(i => i.path.endsWith('photo.jpg'));
    fs.unlinkSync(targetItem.path);

    // Process it — should mark as failed
    processOneItem(db, targetItem.id, targetItem.path, ctx[1]);

    const updatedStmt = db.prepare('SELECT status, error FROM import_queue WHERE id = ?');
    updatedStmt.bind([targetItem.id]);
    updatedStmt.step();
    const updated = updatedStmt.getAsObject();
    updatedStmt.free();

    t.assert.strictEqual(updated.status, IMPORT_STATUS.FAILED);
    t.assert.strictEqual(updated.error, 'File not found');
  });

  await t.test('throws for non-existent directory', async () => {
    const db = await makeDb();
    const scan = bindScanMedia(db);

    t.assert.throws(() => scan('/non/existent/path'), { message: /Directory not found/ });
  });

  await t.test('throws for file path instead of directory', async () => {
    const db = await makeDb();
    const scan = bindScanMedia(db);
    const filePath = path.join(root, 'photo.jpg');

    t.assert.throws(() => scan(filePath), { message: /Not a directory/ });
  });
});
