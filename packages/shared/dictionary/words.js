/**
 * @file Re-usable dictionary of well-known string tokens.
 *
 * Centralising key names avoids silent bugs where one file uses "token"
 * and another uses "accessToken".
 */

export const words = {
  /** localStorage key for auth JWT. */
  token: 'token',

  /** Magic dust currency symbol. */
  dustSymbol: 'Đ',

  /** Magic dust currency name. */
  dustName: 'magic dust',

  /** Quest — infuse button label. */
  infuse: 'Infuse',

  /** Quest — take button label. */
  takeCard: 'Take',

  /** Quest — free take label. */
  takeFree: 'Take free',

  /** Quest — taking in progress. */
  takingCard: 'Taking...',

  /** Quest — skip button label. */
  skipCard: 'Skip',

  /** Quest — not enough dust tooltip. */
  notEnoughDust: 'Not enough magic dust',

  /** Quest — already in inventory label. */
  inInventory: 'In inventory',

  /** Inventory page — empty state description. */
  inventoryEmpty: 'Play games to earn magic dust and collect media for your inventory.',
};
