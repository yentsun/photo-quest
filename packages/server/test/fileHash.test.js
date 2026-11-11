/**
 * @file Tests for full-content file hashing.
 */

import test from 'node:test';
import fs from 'node:fs';
import { PassThrough } from 'node:stream';
import { computeFileHash, FILE_READ_TIMEOUT } from '../src/fileHash.js';

test('computeFileHash rejects a stalled read with FILE_READ_TIMEOUT', async (t) => {
  /* A readable that neither produces nor ends keeps the idle timer as the only
     thing that can settle the hash. */
  const stalled = new PassThrough();
  t.mock.method(fs, 'createReadStream', () => stalled);
  t.after(() => stalled.destroy());

  await t.assert.rejects(
    () => computeFileHash('stalled.bin', 10),
    err => err.code === FILE_READ_TIMEOUT
  );
});
