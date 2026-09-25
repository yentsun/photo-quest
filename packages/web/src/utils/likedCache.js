/**
 * @file Persistent (session) cache of the Liked list.
 *
 * The in-memory page cache is lost on reload, so a cold start shows a loader
 * until IndexedDB/server respond. This keeps a trimmed snapshot in
 * `sessionStorage` so the Liked page can paint the first pages immediately and
 * still refresh in the background. It is also updated in place when a like is
 * added or reset, so the page stays in sync without a manual refresh.
 */

const STORAGE_KEY = 'photoquest.liked-cache-v1';

/** Cap the persisted items so a huge liked library cannot blow the quota. */
const MAX_ITEMS = 300;

/** @type {{ items: Object[], total: number }|null|undefined} */
let _cache;

function read() {
  if (_cache !== undefined) return _cache;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    _cache = raw ? JSON.parse(raw) : null;
  } catch {
    _cache = null;
  }
  return _cache;
}

/**
 * Returns the persisted liked snapshot, or null when nothing is cached.
 * @returns {{ items: Object[], total: number }|null}
 */
export function getCachedLiked() {
  const cached = read();
  return cached ? { items: cached.items, total: cached.total } : null;
}

/**
 * Replace the persisted liked snapshot with the given items (trimmed).
 * @param {Object[]} items
 * @param {number} total
 */
export function setCachedLiked(items, total) {
  const trimmed = (items || []).slice(0, MAX_ITEMS);
  _cache = { items: trimmed, total: total ?? trimmed.length };
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(_cache)); } catch { /* quota / private mode */ }
}

/** Add or update a liked item at the front of the snapshot. */
export function upsertCachedLiked(item) {
  const cached = read();
  if (!cached) return;
  const items = cached.items.filter(m => m.id !== item.id);
  items.unshift(item);
  setCachedLiked(items, Math.max(cached.total, items.length));
}

/** Remove an item from the snapshot (e.g. its likes were reset to zero). */
export function removeCachedLiked(id) {
  const cached = read();
  if (!cached) return;
  setCachedLiked(cached.items.filter(m => m.id !== Number(id)), Math.max(0, cached.total - 1));
}
