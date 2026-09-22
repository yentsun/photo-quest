import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { getCaptureDate, parseFilenameDate } from '../src/mediaDate.js';

test('parseFilenameDate', async (t) => {
  await t.test('parses common photo timestamps with milliseconds', () => {
    t.assert.strictEqual(
      parseFilenameDate('IMG_20260813_172310724_BURST000.jpg'),
      '2026-08-13T17:23:10.000Z'
    );
  });

  await t.test('parses common photo timestamps without milliseconds', () => {
    t.assert.strictEqual(
      parseFilenameDate('20260911_175610 (1).jpg'),
      '2026-09-11T17:56:10.000Z'
    );
  });

  await t.test('rejects invalid calendar dates', () => {
    t.assert.strictEqual(parseFilenameDate('IMG_20260230_120000.jpg'), null);
  });
});

test('getCaptureDate', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'media-date-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  await t.test('prefers EXIF metadata over a filename timestamp', async () => {
    const filePath = path.join(root, 'IMG_20260911_175610.jpg');
    await sharp({
      create: { width: 1, height: 1, channels: 3, background: '#000000' },
      })
      .withExif({
        IFD0: { DateTime: '2026:08:13 17:23:10' },
      })
      .jpeg()
      .toFile(filePath);

    const date = await getCaptureDate(filePath, 'image', new Date('2026-10-01T00:00:00.000Z'));

    t.assert.strictEqual(date, new Date(2026, 7, 13, 17, 23, 10).toISOString());
  });
});
