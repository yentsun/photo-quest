/**
 * @file Connection settings for the Photo Quest MCP server.
 *
 * The MCP server talks to a running Photo Quest instance over HTTP, so the
 * only setting it needs is that instance's base URL.
 */

import configDefaults from '@photo-quest/shared/config.defaults';

/** Base URL used when no override is supplied. */
export const DEFAULT_BASE_URL = `http://localhost:${configDefaults.serverPort}`;

/**
 * Normalise a base URL by trimming whitespace and trailing slashes so route
 * paths can be appended without producing `//` segments.
 *
 * @param {string} value
 * @returns {string}
 */
export function normalizeBaseUrl(value) {
  return value.trim().replace(/\/+$/, '');
}

/**
 * Resolve the Photo Quest base URL from an explicit value, the
 * `PHOTO_QUEST_URL` environment variable, or the local default.
 *
 * @param {string} [value]
 * @returns {string}
 */
export function resolveBaseUrl(value = process.env.PHOTO_QUEST_URL) {
  const raw = (value ?? '').trim();
  return raw === '' ? DEFAULT_BASE_URL : normalizeBaseUrl(raw);
}
