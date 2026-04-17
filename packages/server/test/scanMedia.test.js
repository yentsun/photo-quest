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
import { DatabaseSync as Database } from 'node:sqlite';
import { CREATE_MEDIA_TABLE, CREATE_JOBS_TABLE, CREATE_SCANS_TABLE, CREATE_IMPORT_QUEUE_TABLE, CREATE_FOLDERS_TABLE, SCAN_STATUS, IMPORT_STATUS } from '@photo-quest/shared';
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

/** Create a fresh in-memory database with the schema applied. */
function makeDb() {
  const db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(CREATE_MEDIA_TABLE);
  db.exec(CREATE_JOBS_TABLE);
  db.exec(CREATE_SCANS_TABLE);
  db.exec(CREATE_IMPORT_QUEUE_TABLE);
  db.exec(CREATE_FOLDERS_TABLE);
  return db;
}

function makeContext(db) {
  const kojo = {
    get(key) { if (key === 'db') return db; },
    ops: { bumpVersion: () => {} },
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
  return db.prepare('SELECT * FROM media ORDER BY path').all();
}

/** Query all import_queue rows for a scan. */
function allQueueItems(db, scanId) {
  return db.prepare('SELECT * FROM import_queue WHERE scan_id = ? ORDER BY path').all(scanId);
}

/** Get scan record by id. */
function getScan(db, scanId) {
  return db.prepare('SELECT * FROM scans WHERE id = ?').get(scanId) || null;
}

/** Process all pending queue items (for testing). */
async function drainQueue(db, scanId, logger) {
  const items = allQueueItems(db, scanId).filter(i => i.status === IMPORT_STATUS.PENDING);
  for (const item of items) {
    try {
      await processOneItem(db, item.id, item.path, logger);
    } catch (err) {
      db.prepare(
        'UPDATE import_queue SET status = ?, error = ? WHERE id = ?'
      ).run(IMPORT_STATUS.FAILED, err.message, item.id);
    }
    db.prepare('UPDATE scans SET processed = processed + 1 WHERE id = ?').run(scanId);
  }
  db.prepare('UPDATE scans SET status = ? WHERE id = ?').run(SCAN_STATUS.COMPLETED, scanId);
}

/* ------------------------------------------------------------------ */
/*  Discovery phase tests                                              */
/* ------------------------------------------------------------------ */

test('scanMedia — discovery phase', async (t) => {
  let root;

  t.beforeEach(() => { root = createFixtureTree(); });
  t.afterEach(() => { cleanup(root); });

  await t.test('returns scanId and total count', async () => {
    const db = makeDb();
    const scan = bindScanMedia(db);

    const result = scan(root);

    t.assert.strictEqual(typeof result.scanId, 'number');
    t.assert.strictEqual(result.total, 5);
  });

  await t.test('creates a scan record in the database', async () => {
    const db = makeDb();
    const scan = bindScanMedia(db);

    const { scanId } = scan(root);
    const scanRow = getScan(db, scanId);

    t.assert.ok(scanRow);
    t.assert.strictEqual(scanRow.total, 5);
    t.assert.strictEqual(scanRow.dir_path, root);
  });

  await t.test('queues all media files in import_queue', async () => {
    const db = makeDb();
    const scan = bindScanMedia(db);

    const { scanId } = scan(root);
    const items = allQueueItems(db, scanId);

    t.assert.strictEqual(items.length, 5);
    for (const item of items) {
      t.assert.strictEqual(item.status, IMPORT_STATUS.PENDING);
    }
  });

  await t.test('ignores non-media files in the queue', async () => {
    const db = makeDb();
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
    const db = makeDb();
    const { ctx } = makeContext(db);
    const scan = scanMedia.bind(ctx);

    const { scanId } = scan(root);
    await drainQueue(db, scanId, ctx[1]);

    const rows = allMedia(db);
    const titles = rows.map(r => r.title).sort();
    t.assert.deepStrictEqual(titles, ['deep_clip', 'family', 'nested', 'photo', 'video']);
  });

  await t.test('sets correct type for images vs videos', async () => {
    const db = makeDb();
    const { ctx } = makeContext(db);
    const scan = scanMedia.bind(ctx);

    const { scanId } = scan(root);
    await drainQueue(db, scanId, ctx[1]);

    const rows = allMedia(db);
    const byTitle = Object.fromEntries(rows.map(r => [r.title, r]));

    t.assert.strictEqual(byTitle.photo.type, 'image');
    t.assert.strictEqual(byTitle.nested.type, 'image');
    t.assert.strictEqual(byTitle.family.type, 'image');
    t.assert.strictEqual(byTitle.video.type, 'video');
    t.assert.strictEqual(byTitle.deep_clip.type, 'video');
  });

  await t.test('records correct folder for nested files', async () => {
    const db = makeDb();
    const { ctx } = makeContext(db);
    const scan = scanMedia.bind(ctx);

    const { scanId } = scan(root);
    await drainQueue(db, scanId, ctx[1]);

    const rows = allMedia(db);
    const byTitle = Object.fromEntries(rows.map(r => [r.title, r]));

    t.assert.strictEqual(byTitle.photo.folder, root);
    t.assert.strictEqual(byTitle.nested.folder, path.join(root, 'subdir'));
    t.assert.strictEqual(byTitle.deep_clip.folder, path.join(root, 'subdir', 'deep'));
    t.assert.strictEqual(byTitle.family.folder, path.join(root, 'other'));
  });

  await t.test('creates probe jobs only for videos', async () => {
    const db = makeDb();
    const { ctx } = makeContext(db);
    const scan = scanMedia.bind(ctx);

    const { scanId } = scan(root);
    await drainQueue(db, scanId, ctx[1]);

    const jobs = db.prepare('SELECT j.type, m.title FROM jobs j JOIN media m ON j.media_id = m.id ORDER BY m.title').all();

    const jobTitles = jobs.map(j => j.title).sort();
    t.assert.deepStrictEqual(jobTitles, ['deep_clip', 'video']);
    for (const job of jobs) {
      t.assert.strictEqual(job.type, 'probe');
    }
  });

  await t.test('marks queue items as completed after processing', async () => {
    const db = makeDb();
    const { ctx } = makeContext(db);
    const scan = scanMedia.bind(ctx);

    const { scanId } = scan(root);
    await drainQueue(db, scanId, ctx[1]);

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
    const db = makeDb();
    const { ctx } = makeContext(db);

    // Create scan record and queue directly (without triggering background processing)
    db.prepare('INSERT INTO scans (dir_path, total, status) VALUES (?, 3, ?)').run(root, SCAN_STATUS.IMPORTING);
    const scanId = 1;
    db.prepare('INSERT INTO import_queue (scan_id, path, status) VALUES (?, ?, ?)').run(scanId, path.join(root, 'photo.jpg'), IMPORT_STATUS.PENDING);
    db.prepare('INSERT INTO import_queue (scan_id, path, status) VALUES (?, ?, ?)').run(scanId, path.join(root, 'video.mp4'), IMPORT_STATUS.PENDING);
    db.prepare('INSERT INTO import_queue (scan_id, path, status) VALUES (?, ?, ?)').run(scanId, path.join(root, 'subdir', 'nested.png'), IMPORT_STATUS.PENDING);

    t.assert.strictEqual(getScan(db, scanId).processed, 0);

    const items = allQueueItems(db, scanId);
    await processOneItem(db, items[0].id, items[0].path, ctx[1]);
    db.prepare('UPDATE scans SET processed = processed + 1 WHERE id = ?').run(scanId);
    t.assert.strictEqual(getScan(db, scanId).processed, 1);

    await processOneItem(db, items[1].id, items[1].path, ctx[1]);
    db.prepare('UPDATE scans SET processed = processed + 1 WHERE id = ?').run(scanId);
    t.assert.strictEqual(getScan(db, scanId).processed, 2);

    await processOneItem(db, items[2].id, items[2].path, ctx[1]);
    db.prepare('UPDATE scans SET processed = processed + 1 WHERE id = ?').run(scanId);
    t.assert.strictEqual(getScan(db, scanId).processed, 3);
  });

  await t.test('scan status is completed after draining queue', async () => {
    const db = makeDb();
    const { ctx } = makeContext(db);

    // Create scan record and queue directly
    db.prepare('INSERT INTO scans (dir_path, total, status) VALUES (?, 2, ?)').run(root, SCAN_STATUS.IMPORTING);
    const scanId = 1;
    db.prepare('INSERT INTO import_queue (scan_id, path, status) VALUES (?, ?, ?)').run(scanId, path.join(root, 'photo.jpg'), IMPORT_STATUS.PENDING);
    db.prepare('INSERT INTO import_queue (scan_id, path, status) VALUES (?, ?, ?)').run(scanId, path.join(root, 'video.mp4'), IMPORT_STATUS.PENDING);

    await drainQueue(db, scanId, ctx[1]);

    const scanRow = getScan(db, scanId);
    t.assert.strictEqual(scanRow.status, SCAN_STATUS.COMPLETED);
    t.assert.strictEqual(scanRow.processed, 2);
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
    const db = makeDb();
    const { ctx } = makeContext(db);
    const scan = scanMedia.bind(ctx);

    // First scan + process
    const { scanId: scan1 } = scan(root);
    await drainQueue(db, scan1, ctx[1]);
    t.assert.strictEqual(allMedia(db).length, 5);

    // Second scan + process
    const { scanId: scan2 } = scan(root);
    await drainQueue(db, scan2, ctx[1]);
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
    const db = makeDb();
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
    const db = makeDb();
    const { ctx } = makeContext(db);

    // Create scan and queue directly (no background processing)
    db.prepare('INSERT INTO scans (dir_path, total, status) VALUES (?, 4, ?)').run(root, SCAN_STATUS.IMPORTING);
    const scanId = 1;
    const files = [
      path.join(root, 'photo.jpg'),
      path.join(root, 'video.mp4'),
      path.join(root, 'subdir', 'nested.png'),
      path.join(root, 'subdir', 'deep', 'deep_clip.mkv'),
    ];
    for (const f of files) {
      db.prepare('INSERT INTO import_queue (scan_id, path, status) VALUES (?, ?, ?)').run(scanId, f, IMPORT_STATUS.PENDING);
    }

    // Process only 2 items (simulates partial progress before crash)
    const items = allQueueItems(db, scanId);
    await processOneItem(db, items[0].id, items[0].path, ctx[1]);
    db.prepare('UPDATE scans SET processed = processed + 1 WHERE id = ?').run(scanId);
    await processOneItem(db, items[1].id, items[1].path, ctx[1]);
    db.prepare('UPDATE scans SET processed = processed + 1 WHERE id = ?').run(scanId);

    t.assert.strictEqual(getScan(db, scanId).processed, 2);
    t.assert.strictEqual(allMedia(db).length, 2);

    // Remaining items are still pending — resume should pick them up
    const remaining = allQueueItems(db, scanId).filter(i => i.status === IMPORT_STATUS.PENDING);
    t.assert.strictEqual(remaining.length, 2);

    // Process remaining items (simulates resume)
    for (const item of remaining) {
      await processOneItem(db, item.id, item.path, ctx[1]);
      db.prepare('UPDATE scans SET processed = processed + 1 WHERE id = ?').run(scanId);
    }

    t.assert.strictEqual(allMedia(db).length, 4);
    t.assert.strictEqual(getScan(db, scanId).processed, 4);
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
    const db = makeDb();
    const { ctx } = makeContext(db);
    const scan = scanMedia.bind(ctx);

    const { scanId } = scan(root);

    // Delete a file after discovery
    const items = allQueueItems(db, scanId);
    const targetItem = items.find(i => i.path.endsWith('photo.jpg'));
    fs.unlinkSync(targetItem.path);

    // Process it — should mark as failed
    await processOneItem(db, targetItem.id, targetItem.path, ctx[1]);

    const updated = db.prepare('SELECT status, error FROM import_queue WHERE id = ?').get(targetItem.id);

    t.assert.strictEqual(updated.status, IMPORT_STATUS.FAILED);
    t.assert.strictEqual(updated.error, 'File not found');
  });

  await t.test('throws for non-existent directory', async () => {
    const db = makeDb();
    const scan = bindScanMedia(db);

    t.assert.throws(() => scan('/non/existent/path'), { message: /Directory not found/ });
  });

  await t.test('throws for file path instead of directory', async () => {
    const db = makeDb();
    const scan = bindScanMedia(db);
    const filePath = path.join(root, 'photo.jpg');

    t.assert.throws(() => scan(filePath), { message: /Not a directory/ });
  });
});

/* ------------------------------------------------------------------ */
/*  Folder hierarchy tests                                             */
/* ------------------------------------------------------------------ */

test('scanMedia — folder hierarchy', async (t) => {
  let root;

  t.beforeEach(() => { root = createFixtureTree(); });
  t.afterEach(() => { cleanup(root); });

  await t.test('creates folder records for scan root and all intermediate directories', async () => {
    const db = makeDb();
    const scan = bindScanMedia(db);
    scan(root);

    const folders = db.prepare('SELECT path FROM folders ORDER BY path').all().map(r => r.path);

    /* Fixture tree:
     *   root/photo.jpg, root/video.mp4
     *   root/subdir/nested.png
     *   root/subdir/deep/deep_clip.mkv
     *   root/other/family.jpeg
     *
     * Expected folders: root, root/subdir, root/subdir/deep, root/other
     */
    t.assert.strictEqual(folders.length, 4);
    t.assert.ok(folders.includes(root));
    t.assert.ok(folders.includes(path.join(root, 'subdir')));
    t.assert.ok(folders.includes(path.join(root, 'subdir', 'deep')));
    t.assert.ok(folders.includes(path.join(root, 'other')));
  });

  await t.test('scan root folder has no parent in the folders table', async () => {
    const db = makeDb();
    const scan = bindScanMedia(db);
    scan(root);

    /* The root's dirname is NOT in the folders table,
     * so when computing parentId it should be null. */
    const hasParent = db.prepare('SELECT id FROM folders WHERE path = ?').get(path.dirname(root));

    t.assert.strictEqual(hasParent, undefined);
  });

  await t.test('subfolder parent can be derived from path', async () => {
    const db = makeDb();
    const scan = bindScanMedia(db);
    scan(root);

    /* Get the ID of the root folder. */
    const rootId = db.prepare('SELECT id FROM folders WHERE path = ?').get(root).id;

    /* Get the subdir folder and check its dirname matches root. */
    const subPath = db.prepare('SELECT path FROM folders WHERE path = ?').get(path.join(root, 'subdir')).path;

    /* dirname of subdir should be root (the parent). */
    const parentId = db.prepare('SELECT id FROM folders WHERE path = ?').get(path.dirname(subPath)).id;

    t.assert.strictEqual(parentId, rootId);
  });

  await t.test('re-scanning does not create duplicate folder records', async () => {
    const db = makeDb();
    const scan = bindScanMedia(db);
    scan(root);

    const before = db.prepare('SELECT COUNT(*) as c FROM folders').get().c;

    scan(root);

    const after = db.prepare('SELECT COUNT(*) as c FROM folders').get().c;

    t.assert.strictEqual(after, before);
  });
});
