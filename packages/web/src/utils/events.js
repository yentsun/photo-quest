/**
 * @file Shared DOM event helpers.
 */

export function notifyDustChanged() {
  window.dispatchEvent(new Event('dust-changed'));
}
