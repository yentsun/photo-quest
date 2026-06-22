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
