/**
 * @file Tests for src/sse.js -- SSE client management and broadcasting.
 */

import test from 'node:test';
import { addSseClient, removeSseClient, broadcastSse } from '../src/sse.js';

/* Minimal mock that records write() calls. */
function mockClient() {
  const client = {
    chunks: [],
    write(data) { client.chunks.push(data); },
  };
  return client;
}

test('SSE client management', async (t) => {
  /* Because the clients Set is module-level state, we clean up after
   * each test by removing any clients we added. */

  await t.test('broadcasts to a single client', (t) => {
    const c = mockClient();
    addSseClient(c);

    broadcastSse({ type: 'test' });

    t.assert.strictEqual(c.chunks.length, 1);
    t.assert.strictEqual(c.chunks[0], 'data: {"type":"test"}\n\n');

    removeSseClient(c);
  });

  await t.test('broadcasts to multiple clients', (t) => {
    const c1 = mockClient();
    const c2 = mockClient();
    addSseClient(c1);
    addSseClient(c2);

    broadcastSse({ n: 1 });

    t.assert.strictEqual(c1.chunks.length, 1);
    t.assert.strictEqual(c2.chunks.length, 1);

    removeSseClient(c1);
    removeSseClient(c2);
  });

  await t.test('stops broadcasting after client is removed', (t) => {
    const c = mockClient();
    addSseClient(c);
    removeSseClient(c);

    broadcastSse({ type: 'gone' });

    t.assert.strictEqual(c.chunks.length, 0);
  });

  await t.test('does not add duplicates', (t) => {
    const c = mockClient();
    addSseClient(c);
    addSseClient(c);

    broadcastSse({ x: 1 });

    /* Set prevents duplicates, so only one write. */
    t.assert.strictEqual(c.chunks.length, 1);

    removeSseClient(c);
  });
});
