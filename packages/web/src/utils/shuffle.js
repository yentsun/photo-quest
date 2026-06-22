/**
 * @file Fisher-Yates shuffle algorithm.
 */

/**
 * Shuffle an array in place using Fisher-Yates algorithm.
 * Returns a new array (does not mutate original).
 *
 * @param {Array} array - Array to shuffle
 * @returns {Array} New shuffled array
 */
export function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
