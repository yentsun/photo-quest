/**
 * @file Human-readable formatting helpers.
 */

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

/**
 * Format a byte count as a compact human-readable size (binary units, so KB
 * means 1024 bytes).
 *
 * @param {number|null|undefined} bytes
 * @param {{ decimals?: number }} [options]
 * @returns {string} e.g. `512 B`, `1.5 MB`, `2.3 GB`. A dash for unusable input.
 */
export function formatBytes(bytes, { decimals = 1 } = {}) {
  if (bytes == null || !Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${Math.round(bytes)} B`;

  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit++;
  }

  /* Keep the number to three significant-ish digits: 1.5 MB but 512 MB. */
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(decimals)} ${BYTE_UNITS[unit]}`;
}
