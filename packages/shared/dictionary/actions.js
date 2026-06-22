/**
 * @file Flux / useReducer action type identifiers.
 *
 * Using a constant map (rather than bare strings) catches typos at import time
 * and makes it easy to search the codebase for every place a given action is
 * dispatched or handled.
 */

export const actions = {
  /** Fired once after the app successfully fetches user settings on startup. */
  SETTINGS_LOADED: 'SETTINGS_LOADED',

  /** Fired whenever a single setting value is changed by the user. */
  SETTING_UPDATED: 'SETTING_UPDATED',

  /** Fired when the user manually dismisses a toaster notification, or when
   *  the auto-dismiss timeout expires. */
  ERROR_DISMISSED: 'ERROR_DISMISSED',

  /** Fired when slideshow starts. */
  SLIDESHOW_START: 'SLIDESHOW_START',

  /** Fired when slideshow stops. */
  SLIDESHOW_STOP: 'SLIDESHOW_STOP',

  /** Fired when slideshow advances to next item. */
  SLIDESHOW_NEXT: 'SLIDESHOW_NEXT',

  /** Fired when slideshow goes to previous item. */
  SLIDESHOW_PREV: 'SLIDESHOW_PREV',
};
