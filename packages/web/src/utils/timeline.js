/**
 * @file Day grouping helpers for the Timeline page.
 *
 * Media rows store `date_taken` (ISO-8601) and fall back to `created_at`
 * (`YYYY-MM-DD HH:MM:SS`). Both start with a calendar day, so the first ten
 * characters are the grouping key — the same day boundary the server's
 * `from`/`to` filter uses.
 */

export const UNKNOWN_DAY = 'unknown';

const DAY_PREFIX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Calendar-day key for a media row.
 *
 * @param {Object} item
 * @returns {string} `YYYY-MM-DD`, or `UNKNOWN_DAY` when the row has no date.
 */
export function dayKeyForMedia(item) {
  const raw = String(item?.date_taken ?? item?.created_at ?? '');
  const day = raw.slice(0, 10);
  return DAY_PREFIX.test(day) ? day : UNKNOWN_DAY;
}

/**
 * Group items into consecutive day buckets while preserving their order.
 *
 * A page boundary can split a day; feeding the next page through this helper
 * reuses the existing bucket for that key, so the day never renders twice.
 *
 * @param {Object[]} items
 * @returns {{ key: string, items: Object[] }[]}
 */
export function groupMediaByDay(items = []) {
  const groups = [];
  const byKey = new Map();

  for (const item of items) {
    const key = dayKeyForMedia(item);
    let group = byKey.get(key);
    if (!group) {
      group = { key, items: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.items.push(item);
  }

  return groups;
}

/** Local `YYYY-MM-DD` key for a Date. */
function localDayKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Human-readable heading for a day key.
 *
 * @param {string} key
 * @param {Date} [now] - Injectable clock for tests.
 * @returns {string}
 */
export function formatDayLabel(key, now = new Date()) {
  if (key === UNKNOWN_DAY) return 'Unknown date';

  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const full = date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (key === localDayKey(today)) return `Today · ${full}`;
  if (key === localDayKey(yesterday)) return `Yesterday · ${full}`;
  return full;
}
