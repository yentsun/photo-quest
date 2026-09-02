/**
 * @file Last-view persistence for the resume-on-reload behaviour.
 *
 * Mobile browsers reload a suspended background tab (or relaunch an installed
 * PWA at its start_url) on wake, which can land the app back on the default
 * landing route. This keeps the last non-landing view in sessionStorage so the
 * app can navigate back to it on load.
 *
 * sessionStorage (not localStorage) is used deliberately: it is scoped to the
 * tab, survives a reload within the tab, and is cleared when the tab closes —
 * so a stale view is never resurrected in a fresh session. Landing routes
 * (`/` and `/dashboard`) are not persisted, which means a user who explicitly
 * navigated to the dashboard will not be yanked elsewhere on reload.
 */

const STORAGE_KEY = 'photoquest.nav.session';

/** Landing routes we never restore from (navigating to them clears the saved view). */
function isLanding(path) {
  return path === '/' || path === '/dashboard';
}

/**
 * Persist the current location, clearing the saved view when the user has moved
 * to a landing route.
 *
 * @param {{ pathname: string, search?: string }} location
 */
export function saveNavLocation(location) {
  try {
    const path = location.pathname + (location.search || '');
    if (isLanding(location.pathname)) {
      sessionStorage.removeItem(STORAGE_KEY);
    } else {
      sessionStorage.setItem(STORAGE_KEY, path);
    }
  } catch {
    /* Ignore private-mode/quota errors. */
  }
}

/**
 * Return a previously saved view path, or null if none exists.
 *
 * @returns {string|null}
 */
export function getSavedNavPath() {
  try {
    const path = sessionStorage.getItem(STORAGE_KEY);
    return path && path.startsWith('/') ? path : null;
  } catch {
    return null;
  }
}
