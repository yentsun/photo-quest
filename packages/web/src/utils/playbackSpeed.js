/**
 * @file Playback speed preference shared by the viewer control panel.
 */

export const SPEED_STORAGE_KEY = 'player_speed';

/* Offered speeds, cycled in this order by the toggle. */
export const SPEEDS = [1, 0.5, 0.25];

/** Reads the saved playback speed, falling back to normal speed. */
export function readSavedSpeed() {
  try {
    const saved = Number(localStorage.getItem(SPEED_STORAGE_KEY));
    return SPEEDS.includes(saved) ? saved : 1;
  } catch {
    return 1;
  }
}

/** The next speed in the cycle. */
export function nextSpeed(current) {
  return SPEEDS[(SPEEDS.indexOf(current) + 1) % SPEEDS.length];
}

/** Persists the chosen speed (best-effort — private mode may reject it). */
export function saveSpeed(speed) {
  try {
    localStorage.setItem(SPEED_STORAGE_KEY, String(speed));
  } catch { /* ignore */ }
}
