/**
 * @file Tests for src/http.js -- JSON response, body parsing, route matching.
 */

import test from 'node:test';
import { json, parseBody, matchRoute } from '../src/http.js';

/* ------------------------------------------------------------------ */
/*  Helpers -- minimal mock objects for http.ServerResponse / Request  */
/* ------------------------------------------------------------------ */

function mockRes() {
  const res = {
    _status: null,
    _headers: {},
    _body: '',
    writeHead(status, headers) {
      res._status = status;
      Object.assign(res._headers, headers);
    },
    end(data) {
      res._body = data || '';
    },
  };
  return res;
}

/* ------------------------------------------------------------------ */
/*  json()                                                            */
/* ------------------------------------------------------------------ */

test('json()', async (t) => {
  await t.test('sets status code and Content-Type header', (t) => {
    const res = mockRes();
    json(res, 200, { ok: true });

    t.assert.strictEqual(res._status, 200);
    t.assert.strictEqual(res._headers['Content-Type'], 'application/json');
  });

  await t.test('serialises data as JSON string', (t) => {
    const res = mockRes();
    json(res, 201, { id: 42 });

    t.assert.strictEqual(res._body, '{"id":42}');
  });

  await t.test('handles error status codes', (t) => {
    const res = mockRes();
    json(res, 404, { error: 'Not found' });

    t.assert.strictEqual(res._status, 404);
    t.assert.strictEqual(JSON.parse(res._body).error, 'Not found');
  });
});

/* ------------------------------------------------------------------ */
/*  parseBody()                                                       */
/* ------------------------------------------------------------------ */

test('parseBody()', async (t) => {
  /** Create a minimal readable-stream-like mock that emits data + end. */
  function mockReq(body) {
    const listeners = {};
    return {
      on(event, cb) { listeners[event] = cb; },
      emit() {
        if (body != null) {
          listeners.data(Buffer.from(JSON.stringify(body)));
        }
        listeners.end();
      },
    };
  }

  await t.test('parses a valid JSON body', async (t) => {
    const req = mockReq({ name: 'test' });
    const promise = parseBody(req);
    req.emit();

    const result = await promise;
    t.assert.deepStrictEqual(result, { name: 'test' });
  });

  await t.test('returns null for an empty body', async (t) => {
    const req = mockReq(null);
    const promise = parseBody(req);
    req.emit();

    const result = await promise;
    t.assert.strictEqual(result, null);
  });

  await t.test('rejects on invalid JSON', async (t) => {
    const listeners = {};
    const req = {
      on(event, cb) { listeners[event] = cb; },
    };

    const promise = parseBody(req);
    listeners.data(Buffer.from('not json'));
    listeners.end();

    await t.assert.rejects(promise, { message: 'Invalid JSON' });
  });
});

/* ------------------------------------------------------------------ */
/*  matchRoute()                                                      */
/* ------------------------------------------------------------------ */

test('matchRoute()', async (t) => {
  await t.test('matches a static path', (t) => {
    const params = matchRoute('/media', '/media');
    t.assert.deepStrictEqual(params, {});
  });

  await t.test('extracts a single param', (t) => {
    const params = matchRoute('/media/42', '/media/:id');
    t.assert.deepStrictEqual(params, { id: '42' });
  });

  await t.test('extracts multiple params', (t) => {
    const params = matchRoute('/a/1/b/2', '/a/:x/b/:y');
    t.assert.deepStrictEqual(params, { x: '1', y: '2' });
  });

  await t.test('returns null when segment count differs', (t) => {
    const params = matchRoute('/media/42/extra', '/media/:id');
    t.assert.strictEqual(params, null);
  });

  await t.test('returns null when static segment does not match', (t) => {
    const params = matchRoute('/jobs/42', '/media/:id');
    t.assert.strictEqual(params, null);
  });
});
