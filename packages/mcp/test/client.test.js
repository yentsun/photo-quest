/**
 * @file Tests for the Photo Quest MCP API client.
 */

import test from 'node:test';
import http from 'node:http';
import { createClient } from '../src/client.js';
import { DEFAULT_BASE_URL, resolveBaseUrl } from '../src/config.js';

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * Start an HTTP stub and record every request it receives.
 *
 * @param {import('node:test').TestContext} t
 * @param {(context: { req: http.IncomingMessage, res: http.ServerResponse, body: string|null }) => void} handler
 */
async function startStub(t, handler) {
  const requests = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const body = chunks.length > 0 ? Buffer.concat(chunks).toString('utf8') : null;
      requests.push({
        method: req.method,
        pathname: url.pathname,
        query: Object.fromEntries(url.searchParams),
        body,
      });
      handler({ req, res, body });
    });
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));

  return { baseUrl: `http://127.0.0.1:${server.address().port}`, requests };
}

test('resolveBaseUrl defaults to the local server and trims trailing slashes', (t) => {
  t.assert.equal(resolveBaseUrl(''), DEFAULT_BASE_URL);
  t.assert.equal(resolveBaseUrl('  http://media.local:9000/  '), 'http://media.local:9000');
});

test('listMedia sends filters and parses JSON-encoded columns', async (t) => {
  const stub = await startStub(t, ({ res }) => sendJson(res, 200, {
    total: 1,
    items: [{ id: 7, title: 'Sunset', tags: '["sky","trip"]', effect_config: '{"type":"rays"}' }],
  }));

  const client = createClient({ baseUrl: `${stub.baseUrl}/` });
  const data = await client.listMedia({
    search: 'sun',
    tag: 'trip',
    type: 'image',
    folder: '/media/photos',
    subtree: true,
    liked: true,
    sort: 'likes',
    from: '2024-01-01',
    to: '2024-12-31',
    limit: 5,
    offset: 10,
  });

  t.assert.equal(stub.requests[0].method, 'GET');
  t.assert.equal(stub.requests[0].pathname, '/media');
  t.assert.deepEqual(stub.requests[0].query, {
    search: 'sun',
    tag: 'trip',
    type: 'image',
    folder: '/media/photos',
    subtree: '1',
    liked: '1',
    sort: 'likes',
    from: '2024-01-01',
    to: '2024-12-31',
    limit: '5',
    offset: '10',
  });
  t.assert.equal(data.total, 1);
  t.assert.deepEqual(data.items[0].tags, ['sky', 'trip']);
  t.assert.deepEqual(data.items[0].effect_config, { type: 'rays' });
});

test('a failed API call surfaces the server error and status', async (t) => {
  const stub = await startStub(t, ({ res }) => sendJson(res, 404, { error: 'Media not found' }));
  const client = createClient({ baseUrl: stub.baseUrl });

  await t.assert.rejects(async () => {
    try {
      await client.getMedia(99);
    } catch (err) {
      t.assert.equal(err.status, 404);
      throw err;
    }
  }, /Media not found/);
  t.assert.equal(stub.requests[0].pathname, '/media/99');
});

test('write operations use the shared routes and JSON bodies', async (t) => {
  const stub = await startStub(t, ({ req, res }) => {
    if (req.url === '/media/scan') return sendJson(res, 200, { scanId: 3, total: 12 });
    if (req.url === '/duplicates/merge') {
      return sendJson(res, 200, {
        media: { id: 5, tags: '["keep"]' },
        merged: 1,
        deletedFiles: 1,
      });
    }
    return sendJson(res, 200, { id: 5, likes: 2, tags: ['keep'] });
  });
  const client = createClient({ baseUrl: stub.baseUrl });

  const scan = await client.scan('/media/photos');
  t.assert.deepEqual(scan, { scanId: 3, total: 12 });

  const liked = await client.likeMedia(5, 2);
  t.assert.equal(liked.likes, 2);

  const tagged = await client.updateTags(5, ['keep']);
  t.assert.deepEqual(tagged.tags, ['keep']);

  const merged = await client.mergeDuplicates({ ids: [5, 9], keepId: 5 });
  t.assert.deepEqual(merged.media.tags, ['keep']);

  t.assert.deepEqual(stub.requests.map(r => `${r.method} ${r.pathname}`), [
    'POST /media/scan',
    'PATCH /media/5/like',
    'PATCH /media/5/tags',
    'POST /duplicates/merge',
  ]);
  t.assert.deepEqual(JSON.parse(stub.requests[0].body), { path: '/media/photos' });
  t.assert.deepEqual(stub.requests[1].query, { count: '2' });
  t.assert.deepEqual(JSON.parse(stub.requests[2].body), { tags: ['keep'] });
  t.assert.deepEqual(JSON.parse(stub.requests[3].body), { ids: [5, 9], keepId: 5 });
});

test('updateTags trims and deduplicates tags', async (t) => {
  const stub = await startStub(t, ({ res }) => sendJson(res, 200, { id: 5, tags: ['keep', 'sky'] }));
  const client = createClient({ baseUrl: stub.baseUrl });

  const item = await client.updateTags(5, [' keep ', 'keep', 'sky', '   ']);

  t.assert.deepEqual(JSON.parse(stub.requests[0].body), { tags: ['keep', 'sky'] });
  t.assert.deepEqual(item.tags, ['keep', 'sky']);
});

test('listDuplicates and listFailed parse media rows inside groups', async (t) => {
  const stub = await startStub(t, ({ res }) => sendJson(res, 200, {
    groupCount: 1,
    groups: [{
      hash: 'abc',
      items: [{ id: 1, tags: '["trip"]', effect_config: '{"type":"rays"}' }],
    }],
  }));
  const client = createClient({ baseUrl: stub.baseUrl });

  for (const data of [await client.listDuplicates({}), await client.listFailed({})]) {
    t.assert.deepEqual(data.groups[0].items[0].tags, ['trip']);
    t.assert.deepEqual(data.groups[0].items[0].effect_config, { type: 'rays' });
  }
  t.assert.deepEqual(stub.requests.map(r => r.pathname), ['/duplicates', '/failed']);
});

test('merge errors expose the API code and reconciled count', async (t) => {
  const stub = await startStub(t, ({ res }) => sendJson(res, 409, {
    error: 'These items are no longer duplicates; their hashes were refreshed',
    code: 'STALE_DUPLICATES',
    reconciled: 2,
  }));
  const client = createClient({ baseUrl: stub.baseUrl });

  await t.assert.rejects(async () => {
    try {
      await client.mergeDuplicates({ ids: [1, 2] });
    } catch (err) {
      t.assert.equal(err.status, 409);
      t.assert.equal(err.code, 'STALE_DUPLICATES');
      t.assert.equal(err.reconciled, 2);
      throw err;
    }
  }, /no longer duplicates/);
  t.assert.equal(stub.requests[0].pathname, '/duplicates/merge');
});

test('an unreachable server produces a descriptive error', async (t) => {
  const client = createClient({ baseUrl: 'http://127.0.0.1:1' });
  await t.assert.rejects(() => client.listTags(), /Cannot reach Photo Quest at http:\/\/127\.0\.0\.1:1/);
});
