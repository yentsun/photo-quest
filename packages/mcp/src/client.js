/**
 * @file Thin client for the Photo Quest HTTP API.
 *
 * The MCP server deliberately does not read the SQLite database directly:
 * every tool goes through the same REST endpoints the web client uses, so
 * behavior (filtering, validation, file checks) only lives in one place and
 * the server can run against any Photo Quest instance on the network.
 */

import { apiRoutes } from '@photo-quest/shared';
import { DEFAULT_BASE_URL, normalizeBaseUrl } from './config.js';

/**
 * Parse a media row's JSON-encoded columns so tool output is directly usable.
 *
 * @param {Object|null} item
 * @returns {Object|null}
 */
function parseMedia(item) {
  if (!item) return item;
  for (const key of ['tags', 'effect_config']) {
    if (typeof item[key] !== 'string') continue;
    try {
      item[key] = JSON.parse(item[key]);
    } catch { /* keep the raw value if it is not valid JSON */ }
  }
  return item;
}

/**
 * Parse the media rows nested inside duplicate/failed groups.
 *
 * @param {Object|null} data
 * @returns {Object|null}
 */
function parseGroups(data) {
  for (const group of data?.groups ?? []) {
    if (Array.isArray(group.items)) group.items = group.items.map(parseMedia);
  }
  return data;
}

/**
 * Substitute the `:id` placeholder in a shared route template.
 *
 * @param {string} route
 * @param {number|string} id
 * @returns {string}
 */
function withId(route, id) {
  return route.replace(':id', encodeURIComponent(String(id)));
}

/** Default upper bound for a single API request, in milliseconds. A merge hashes
 * multi-MB files server-side, so a single request can legitimately take minutes. */
const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Connection-level failures that may succeed on a second attempt.
 *
 * Retries are limited to idempotent GET requests: a merge POST that was applied
 * before its connection dropped would report a misleading failure if replayed.
 */
const TRANSIENT_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
  'ETIMEDOUT',
  'ERR_STREAM_PREMATURE_CLOSE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
]);

/** The system-level code, if any, behind a failed fetch. */
function connectionCode(err) {
  return err?.cause?.code ?? err?.code ?? null;
}

/**
 * Build an error that names what actually failed. `fetch` reports every
 * connection problem as "fetch failed", so the underlying `cause` (ECONNRESET,
 * UND_ERR_HEADERS_TIMEOUT, ECONNREFUSED, ...) is surfaced here instead of being
 * discarded.
 *
 * @param {Error} err
 * @param {string} base
 * @param {number} timeoutMs
 * @returns {Error}
 */
function connectionError(err, base, timeoutMs) {
  const cause = err?.cause;
  const timedOut = err?.name === 'TimeoutError' || cause?.name === 'TimeoutError';
  const code = connectionCode(err);
  const details = [...new Set([code, cause?.message].filter(Boolean))].join(': ');
  const message = timedOut
    ? `Cannot reach Photo Quest at ${base}: no response within ${timeoutMs} ms`
    : `Cannot reach Photo Quest at ${base}: ${err?.message ?? err}${details ? ` (${details})` : ''}`;

  const error = new Error(message);
  if (cause) error.cause = cause;
  if (code) error.code = code;
  return error;
}

/**
 * Create an API client bound to one Photo Quest instance.
 *
 * @param {{ baseUrl?: string, fetchImpl?: typeof fetch, timeoutMs?: number }} [options]
 */
export function createClient({
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const base = normalizeBaseUrl(baseUrl);
  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;

  /**
   * @param {string} pathname
   * @param {{ method?: string, query?: Object, body?: Object }} [options]
   * @returns {Promise<any>}
   */
  async function request(pathname, { method = 'GET', query, body } = {}) {
    const url = new URL(pathname, base);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }

    const init = { method };
    if (body !== undefined) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(body);
    }

    const attempts = method === 'GET' ? 2 : 1;
    let response;
    let text;
    for (let attempt = 1; ; attempt++) {
      try {
        response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeout) });
        text = await response.text();
        break;
      } catch (err) {
        if (attempt < attempts && TRANSIENT_CODES.has(connectionCode(err))) continue;
        throw connectionError(err, base, timeout);
      }
    }

    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!response.ok) {
      const message = data && typeof data === 'object' && data.error
        ? data.error
        : `Photo Quest request failed (${response.status})`;
      const error = new Error(message);
      error.status = response.status;
      if (data && typeof data === 'object') {
        if (data.code) error.code = data.code;
        if (data.reconciled != null) error.reconciled = data.reconciled;
      }
      throw error;
    }

    return data;
  }

  return {
    /**
     * @param {{ search?: string, tag?: string, type?: string, folder?: string,
     *   subtree?: boolean, liked?: boolean, sort?: string, from?: string,
     *   to?: string, limit?: number, offset?: number }} [filters]
     */
    async listMedia(filters = {}) {
      const data = await request(apiRoutes.media, {
        query: {
          search: filters.search,
          tag: filters.tag,
          type: filters.type,
          folder: filters.folder,
          subtree: filters.subtree ? '1' : undefined,
          liked: filters.liked ? '1' : undefined,
          sort: filters.sort,
          from: filters.from,
          to: filters.to,
          limit: filters.limit,
          offset: filters.offset,
        },
      });
      return { total: data.total, items: (data.items ?? []).map(parseMedia) };
    },

    async getMedia(id) {
      return parseMedia(await request(withId(apiRoutes.mediaById, id)));
    },

    async listTags() {
      return request(apiRoutes.tags);
    },

    async listFolders() {
      return request(apiRoutes.folders);
    },

    async listJobs() {
      return request(apiRoutes.jobs);
    },

    async listDuplicates({ limit, offset } = {}) {
      return parseGroups(await request(apiRoutes.duplicates, { query: { limit, offset } }));
    },

    async listFailed({ limit, offset } = {}) {
      return parseGroups(await request(apiRoutes.failed, { query: { limit, offset } }));
    },

    async mergeDuplicates({ ids, keepId }) {
      const result = await request(apiRoutes.duplicatesMerge, {
        method: 'POST',
        body: keepId != null ? { ids, keepId } : { ids },
      });
      if (result?.media) parseMedia(result.media);
      return result;
    },

    async getStorage() {
      return request(apiRoutes.storage);
    },

    async getLibrary() {
      return request(apiRoutes.libraryStatus);
    },

    async scan(path) {
      return request(apiRoutes.mediaScan, { method: 'POST', body: { path } });
    },

    async updateTags(id, tags) {
      const unique = [...new Set(tags.map(tag => tag.trim()).filter(Boolean))];
      return parseMedia(await request(withId(apiRoutes.mediaTags, id), {
        method: 'PATCH',
        body: { tags: unique },
      }));
    },

    async likeMedia(id, count = 1) {
      return parseMedia(await request(withId(apiRoutes.mediaLike, id), {
        method: 'PATCH',
        query: { count },
      }));
    },
  };
}
