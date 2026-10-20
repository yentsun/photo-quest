/**
 * @file Tests for Timeline day grouping and headings.
 */

import test from 'node:test';
import { dayKeyForMedia, formatDayLabel, groupMediaByDay, UNKNOWN_DAY } from '../src/utils/timeline.js';

test('timeline grouping', async (t) => {
  await t.test('uses date_taken before created_at, and its first ten chars', (t) => {
    t.assert.strictEqual(
      dayKeyForMedia({ date_taken: '2026-10-18T21:30:00.000Z', created_at: '2026-10-19 08:00:00' }),
      '2026-10-18',
    );
    t.assert.strictEqual(
      dayKeyForMedia({ date_taken: null, created_at: '2026-10-19 08:00:00' }),
      '2026-10-19',
    );
  });

  await t.test('returns UNKNOWN_DAY without a usable date', (t) => {
    t.assert.strictEqual(dayKeyForMedia({ title: 'x' }), UNKNOWN_DAY);
    t.assert.strictEqual(dayKeyForMedia({ date_taken: 'not-a-date' }), UNKNOWN_DAY);
    /* Matches the server, where COALESCE keeps an empty date_taken instead of
       falling back to created_at. */
    t.assert.strictEqual(
      dayKeyForMedia({ date_taken: '', created_at: '2026-10-19 08:00:00' }),
      UNKNOWN_DAY,
    );
  });

  await t.test('groups consecutive items and merges a day split across pages', (t) => {
    const firstPage = [
      { id: 1, date_taken: '2026-10-18T20:00:00.000Z' },
      { id: 2, date_taken: '2026-10-18T10:00:00.000Z' },
      { id: 3, date_taken: '2026-10-17T23:00:00.000Z' },
    ];
    const secondPage = [
      { id: 4, date_taken: '2026-10-17T08:00:00.000Z' },
      { id: 5, created_at: '2026-10-16 12:00:00' },
    ];

    const groups = groupMediaByDay([...firstPage, ...secondPage]);
    t.assert.deepStrictEqual(groups.map(g => g.key), ['2026-10-18', '2026-10-17', '2026-10-16']);
    t.assert.deepStrictEqual(groups[0].items.map(i => i.id), [1, 2]);
    t.assert.deepStrictEqual(groups[1].items.map(i => i.id), [3, 4]);
  });

  await t.test('labels today and yesterday relative to the supplied clock', (t) => {
    const now = new Date(2026, 9, 18, 12);
    t.assert.ok(formatDayLabel('2026-10-18', now).startsWith('Today ·'));
    t.assert.ok(formatDayLabel('2026-10-17', now).startsWith('Yesterday ·'));
    t.assert.ok(formatDayLabel('2026-10-16', now).includes('2026'));
    t.assert.strictEqual(formatDayLabel(UNKNOWN_DAY, now), 'Unknown date');
  });
});
