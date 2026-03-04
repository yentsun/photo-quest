/**
 * @file Local-storage persistence helpers ("keep" as in "keep data around").
 *
 * Every interaction with `window.localStorage` goes through this module.
 * Centralising storage access has two benefits:
 *
 *  1. Key names are defined in one place (via the shared `words` constants),
 *     so a typo in a key string is caught at import time rather than causing
 *     a silent data-loss bug.
 *
 *  2. If we ever need to migrate to a different storage backend (IndexedDB,
 *     cookies, etc.) only this file needs to change.
 */

import { words } from '@photo-quest/shared';

// ---------------------------------------------------------------------------
// Auth token helpers
// ---------------------------------------------------------------------------

/**
 * Retrieve the authentication JWT from localStorage.
 *
 * @returns {string | null} The stored token, or null if the user has not
 *   authenticated yet (or the token was cleared).
 */
export function getTokenFromStorage() {
  return localStorage.getItem(words.token);
}

/**
 * Remove the authentication JWT from localStorage.
 * Called during logout or when the token is known to be expired / invalid.
 */
export function clearTokenFromStorage() {
  localStorage.removeItem(words.token);
}

/**
 * Persist a freshly-received authentication JWT so that subsequent page loads
 * can skip the login step.
 *
 * @param {string} accessToken - The JWT string returned by the auth endpoint.
 */
export function storeToken(accessToken) {
  localStorage.setItem(words.token, accessToken);
}

// ---------------------------------------------------------------------------
// User settings helpers
// ---------------------------------------------------------------------------

/**
 * Merge new settings into the settings object stored for a given user.
 *
 * Settings are keyed by userId so that multiple accounts on the same browser
 * each keep their own preferences.  The merge is shallow -- top-level keys
 * in `settings` overwrite existing keys, but nested objects are not deeply
 * merged.
 *
 * @param {string} userId   - Unique identifier for the current user.
 * @param {Object} settings - Key/value pairs to merge into the stored settings.
 */
export function storeSettings(userId, settings) {
  const currentSettings = JSON.parse(localStorage.getItem(userId)) || {};
  localStorage.setItem(userId, JSON.stringify({ ...currentSettings, ...settings }));
}

/**
 * Wipe **all** localStorage data.
 *
 * This is the "nuclear option" -- called from the ErrorBoundary when the app
 * hits an unrecoverable error, under the assumption that corrupted cached
 * state may be the root cause.
 */
export function clearStorage() {
  localStorage.clear();
}

/**
 * Retrieve the full settings object for a given user.
 *
 * @param {string} userId - Unique identifier for the current user.
 * @returns {Object} The parsed settings object, or an empty object if nothing
 *   has been stored yet.
 */
export function getSettingsFromStorage(userId) {
  return JSON.parse(localStorage.getItem(userId) || '{}');
}
