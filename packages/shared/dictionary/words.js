/**
 * @file Re-usable dictionary of well-known string tokens.
 *
 * Centralising key names avoids silent bugs where one file uses "token"
 * and another uses "accessToken".
 */

export const words = {
  /** localStorage key for auth JWT. */
  token: 'token'
};
