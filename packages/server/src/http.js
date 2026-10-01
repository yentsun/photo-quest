/**
 * @file Shared HTTP helpers used by all endpoint handlers.
 */

import fs from 'node:fs';

/**
 * Send a JSON response.
 */
export function json(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * Stream a file to the response, guarding against read errors.
 *
 * A file can disappear between the caller's existence check and the actual
 * read (e.g. a duplicate merge deletes a thumbnail mid-request). A
 * `ReadStream` with no 'error' listener emits an unhandled 'error' event and
 * takes the whole process down, so this always attaches one: if the response
 * has not started it reports 404 (or 500 for any other read failure),
 * otherwise it aborts the response so the client does not hang.
 *
 * @param {import('http').ServerResponse} res
 * @param {string} filePath
 * @param {import('fs').CreateReadStreamOptions} [options]
 * @returns {import('fs').ReadStream}
 */
export function sendFile(res, filePath, options) {
  const stream = fs.createReadStream(filePath, options);
  stream.on('error', (err) => {
    if (res.headersSent) {
      res.destroy();
    } else {
      const status = err.code === 'ENOENT' ? 404 : 500;
      res.writeHead(status, { 'Content-Type': 'text/plain' });
      res.end(status === 404 ? 'Not found' : 'Read error');
    }
  });
  stream.pipe(res);
  return stream;
}

/**
 * Parse JSON request body.
 */
export function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      if (chunks.length === 0) return resolve(null);
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Match a URL pathname against a pattern with :params.
 * Returns params object or null.
 */
export function matchRoute(pathname, pattern) {
  const pathParts = pathname.split('/');
  const patternParts = pattern.split('/');
  if (pathParts.length !== patternParts.length) return null;

  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = pathParts[i];
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}
