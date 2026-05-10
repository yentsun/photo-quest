/**
 * @file Application-wide constants shared across every package in the monorepo.
 *
 * String constants (actions, words, enums, extensions) are in the dictionary/
 * folder. This file contains non-string configuration values.
 */

// Re-export all dictionary strings for backwards compatibility
export * from './dictionary/index.js';

// ---------------------------------------------------------------------------
// UI timing
// ---------------------------------------------------------------------------

/**
 * How long (in milliseconds) a toaster notification stays visible before it
 * auto-dismisses. 5000 ms is long enough to read a short message but short
 * enough not to be annoying.
 *
 * @type {number}
 */
export const toasterTimeout = 5000;

/**
 * How long (in milliseconds) between slideshow auto-advance for images.
 *
 * @type {number}
 */
export const slideshowInterval = 5000;

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

/**
 * Dust price for taking, destroying, or buying a media card based on its
 * infusion. `infusion * 2` with a floor of 2 so a non-infused card still
 * costs (or rewards) something. Used by the client UI for previews and by
 * server ops for the authoritative charge — they MUST agree.
 *
 * @param {number} infusion
 * @returns {number}
 */
export function cardCost(infusion) {
  return Math.max(2, (infusion || 0) * 2);
}
