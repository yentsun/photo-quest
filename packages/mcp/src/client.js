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
 * Substitute the `:id` placeholder in a shared route template.
 *
 * @param {string} route
 * @param {number|string} id
 * @returns {string}
 */
function withId(route, id) {
  return route.replace(':id', encodeURIComponent(String(id)));
}

/**
 * Create an API client bound to one Photo Quest instance.
 *
 * @param {{ baseUrl?: string, fetchImpl?: typeof fetch }} [options]
 */
export function createClient({ baseUrl = DEFAULT_BASE_URL, fetchImpl = globalThis.fetch } = {}) {
  const base = normalizeBaseUrl(baseUrl);

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

    let response;
    try {
      response = await fetchImpl(url, init);
    } catch (err) {
      throw new Error(`Cannot reach Photo Quest at ${base}: ${err.message}`);
    }

    const text = await response.text();
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
      return request(apiRoutes.duplicates, { query: { limit, offset } });
    },

    async listFailed({ limit, offset } = {}) {
      return request(apiRoutes.failed, { query: { limit, offset } });
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
      return parseMedia(await request(withId(apiRoutes.mediaTags, id), {
        method: 'PATCH',
        body: { tags },
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
