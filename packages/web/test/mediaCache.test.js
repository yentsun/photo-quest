/**
 * @file Tests for the session media cache used to reconcile navigation
 * snapshots (slideshow and folder up/down) with optimistic edits like liking.
 */

import test from 'node:test';
import { getLastMediaItem, cacheMediaItem } from '../src/utils/api.js';

test('session media cache', async (t) => {
  await t.test('cacheMediaItem makes an item readable via getLastMediaItem', (t) => {
    cacheMediaItem({ id: 9001, likes: 3, title: 'a' });
    t.assert.strictEqual(getLastMediaItem(9001).likes, 3);
  });

  await t.test('accepts a string id and normalises it to a number', (t) => {
    cacheMediaItem({ id: '9002', likes: 1 });
    t.assert.strictEqual(getLastMediaItem(9002).likes, 1);
  });

  await t.test('returns null for an unknown id', (t) => {
    t.assert.strictEqual(getLastMediaItem(99999), null);
  });

  await t.test('ignores items without an id', (t) => {
    const result = cacheMediaItem({ likes: 1 });
    t.assert.deepStrictEqual(result, { likes: 1 });
    t.assert.strictEqual(getLastMediaItem(9003), null);
  });

  /* The reconciliation itself: spread the fresh snapshot under the cached item
     so a later navigation restores the optimistic like rather than the stale
     snapshot value. Mirrors `withCachedEdits` in MediaPage. */
  await t.test('cached edits win over a stale navigation snapshot', (t) => {
    cacheMediaItem({ id: 9004, likes: 5, tags: ['x'] });
    const snapshot = { id: 9004, likes: 0, tags: [] };
    const merged = { ...snapshot, ...getLastMediaItem(snapshot.id) };
    t.assert.strictEqual(merged.likes, 5);
    t.assert.deepStrictEqual(merged.tags, ['x']);
  });
});
