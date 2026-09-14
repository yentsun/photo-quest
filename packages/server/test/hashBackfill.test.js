/**
 * @file Tests for the legacy-hash backfill (issue #63).
 *
 * Covers:
 *  - Re-hashing legacy first-64KB fingerprints with the full-content algorithm
 *  - Idempotency: rows already stamped with the current version are untouched
 *  - Rows without a hash are ignored (client-added media)
 *  - Unreadable/missing files are skipped and left legacy for a later run
 *  - Bounded, resumable batches
 */

import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync as Database } from 'node:sqlite';
import { CREATE_MEDIA_TABLE, HASH_VERSION } from '@photo-quest/shared';
import { computeFileHash } from '../src/fileHash.js';
import { backfillHashBatch, backfillHashes, countLegacyHashes } from '../src/hashBackfill.js';

/** Recreate the pre-#58 fingerprint: sha256(first 64KB + size)[:32]. */
function legacyFingerprint(buffer) {
  const hash = crypto.createHash('sha256');
  hash.update(buffer.subarray(0, Math.min(65536, buffer.length)));
  hash.update(String(buffer.length));
  return hash.digest('hex').substring(0, 32);
}

function freshDb() {
  const db = new Database(':memory:');
  db.exec(CREATE_MEDIA_TABLE);
  return db;
}

/** Insert a media row directly; returns its id. */
function insertMedia(db, filePath, { hash = null, hashVersion = null, title = 'Test' } = {}) {
  const { lastInsertRowid } = db.prepare(
    "INSERT INTO media (path, title, status, hash, hash_version) VALUES (?, ?, 'ready', ?, ?)"
  ).run(filePath, title, hash, hashVersion);
  return lastInsertRowid;
}

const silentLogger = { info() {}, warn() {}, debug() {}, error() {} };

test('hashBackfill', async (t) => {
  let root;
  t.beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'hash-backfill-')); });
  t.afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  await t.test('re-hashes legacy fingerprints with full-content hashes', async () => {
    const db = freshDb();
    const prefix = Buffer.alloc(65536, 'a');

    /* Same first 64 KB and size, different tail — the false-positive case. */
    const a = path.join(root, 'a.jpg');
    const b = path.join(root, 'b.jpg');
    fs.writeFileSync(a, Buffer.concat([prefix, Buffer.from('A')]));
    fs.writeFileSync(b, Buffer.concat([prefix, Buffer.from('B')]));

    const idA = insertMedia(db, a, { hash: legacyFingerprint(fs.readFileSync(a)) });
    const idB = insertMedia(db, b, { hash: legacyFingerprint(fs.readFileSync(b)) });

    /* The legacy algorithm collides on these two files. */
    const before = db.prepare('SELECT hash FROM media WHERE id IN (?, ?) ORDER BY id').all(idA, idB);
    t.assert.strictEqual(before[0].hash, before[1].hash, 'legacy fingerprints should collide');

    const result = await backfillHashes(db, { logger: silentLogger });
    t.assert.strictEqual(result.updated, 2);
    t.assert.strictEqual(result.skipped, 0);

    const after = db.prepare('SELECT hash, hash_version FROM media WHERE id IN (?, ?) ORDER BY id').all(idA, idB);
    t.assert.notStrictEqual(after[0].hash, after[1].hash, 'full-content hashes should differ');
    t.assert.strictEqual(after[0].hash_version, HASH_VERSION);
    t.assert.strictEqual(after[1].hash_version, HASH_VERSION);

    /* The new hash must equal the current full-content algorithm. */
    t.assert.strictEqual(after[0].hash, await computeFileHash(a));
    t.assert.strictEqual(after[1].hash, await computeFileHash(b));
  });

  await t.test('groups byte-identical legacy rows under the same hash', async () => {
    const db = freshDb();
    const a = path.join(root, 'same-a.jpg');
    const b = path.join(root, 'same-b.jpg');
    fs.writeFileSync(a, 'identical-bytes');
    fs.writeFileSync(b, 'identical-bytes');

    insertMedia(db, a, { hash: legacyFingerprint(fs.readFileSync(a)) });
    insertMedia(db, b, { hash: legacyFingerprint(fs.readFileSync(b)) });

    await backfillHashes(db, { logger: silentLogger });

    const rows = db.prepare('SELECT hash FROM media ORDER BY id').all();
    t.assert.strictEqual(rows[0].hash, rows[1].hash);
    t.assert.strictEqual(rows[0].hash, await computeFileHash(a));
  });

  await t.test('leaves rows already at the current version untouched', async () => {
    const db = freshDb();
    const file = path.join(root, 'current.jpg');
    fs.writeFileSync(file, 'current-bytes');
    const current = await computeFileHash(file);
    const id = insertMedia(db, file, { hash: current, hashVersion: HASH_VERSION });

    /* Mutate the file so a re-hash would produce a different value. */
    fs.writeFileSync(file, 'changed-bytes');

    const result = await backfillHashes(db, { logger: silentLogger });
    t.assert.strictEqual(result.updated, 0);

    const row = db.prepare('SELECT hash, hash_version FROM media WHERE id = ?').get(id);
    t.assert.strictEqual(row.hash, current);
    t.assert.strictEqual(row.hash_version, HASH_VERSION);
  });

  await t.test('ignores rows without a hash', async () => {
    const db = freshDb();
    insertMedia(db, path.join(root, 'no-hash.jpg'), { hash: null });
    insertMedia(db, path.join(root, 'empty-hash.jpg'), { hash: '' });

    const result = await backfillHashes(db, { logger: silentLogger });
    t.assert.strictEqual(result.updated, 0);
    t.assert.strictEqual(result.skipped, 0);

    const rows = db.prepare('SELECT hash, hash_version FROM media').all();
    for (const row of rows) {
      t.assert.strictEqual(row.hash_version, null);
    }
  });

  await t.test('skips missing files and leaves them legacy for a later run', async () => {
    const db = freshDb();
    const present = path.join(root, 'present.jpg');
    fs.writeFileSync(present, 'present-bytes');
    const presentId = insertMedia(db, present, { hash: 'legacy-present' });
    const missingId = insertMedia(db, path.join(root, 'gone.jpg'), { hash: 'legacy-missing' });

    const result = await backfillHashes(db, { logger: silentLogger });
    t.assert.strictEqual(result.updated, 1);
    t.assert.strictEqual(result.skipped, 1);

    const presentRow = db.prepare('SELECT hash_version FROM media WHERE id = ?').get(presentId);
    t.assert.strictEqual(presentRow.hash_version, HASH_VERSION);

    const missingRow = db.prepare('SELECT hash, hash_version FROM media WHERE id = ?').get(missingId);
    t.assert.strictEqual(missingRow.hash, 'legacy-missing');
    t.assert.strictEqual(missingRow.hash_version, null);
  });

  await t.test('runs the whole set in one pass and reports progress', async () => {
    const db = freshDb();
    for (let i = 0; i < 25; i++) {
      const file = path.join(root, `progress-${i}.jpg`);
      fs.writeFileSync(file, `progress-bytes-${i}`);
      insertMedia(db, file, { hash: `legacy-${i}` });
    }

    const messages = [];
    const logger = {
      info: (msg) => messages.push(msg),
      warn: (msg) => messages.push(msg),
      debug: () => {},
      error: () => {},
    };

    const result = await backfillHashes(db, { logger });
    t.assert.strictEqual(result.total, 25);
    t.assert.strictEqual(result.updated, 25);
    t.assert.strictEqual(result.skipped, 0);
    t.assert.strictEqual(countLegacyHashes(db), 0);

    t.assert.ok(messages[0].includes('re-hashing 25 legacy hash(es)'), messages[0]);
    t.assert.ok(messages.some(m => m.includes('20/25')), 'should report intermediate progress');
    t.assert.ok(messages.at(-1).includes('done'), messages.at(-1));
  });

  await t.test('processes bounded, resumable batches without re-selecting skipped rows', async () => {
    const db = freshDb();
    const ids = [];
    for (let i = 0; i < 3; i++) {
      const file = path.join(root, `file-${i}.jpg`);
      fs.writeFileSync(file, `bytes-${i}`);
      ids.push(insertMedia(db, file, { hash: `legacy-${i}` }));
    }
    /* A missing file that must be advanced past, not re-selected forever. */
    const missingId = insertMedia(db, path.join(root, 'missing.jpg'), { hash: 'legacy-missing' });

    const first = await backfillHashBatch(db, { afterId: 0, batchSize: 1, logger: silentLogger });
    t.assert.strictEqual(first.rows.length, 1);
    t.assert.strictEqual(first.updated, 1);
    t.assert.strictEqual(first.lastId, ids[0]);

    const second = await backfillHashBatch(db, { afterId: first.lastId, batchSize: 10, logger: silentLogger });
    t.assert.strictEqual(second.updated, 2);
    t.assert.strictEqual(second.skipped, 1);
    t.assert.strictEqual(second.lastId, missingId);

    /* Nothing left to select — the cursor has advanced past every row. */
    const third = await backfillHashBatch(db, { afterId: second.lastId, batchSize: 10, logger: silentLogger });
    t.assert.strictEqual(third.rows.length, 0);

    /* The missing row is still legacy, so a future run retries it. */
    const missingRow = db.prepare('SELECT hash_version FROM media WHERE id = ?').get(missingId);
    t.assert.strictEqual(missingRow.hash_version, null);
  });
});
