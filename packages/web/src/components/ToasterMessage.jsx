/**
 * @file Toast notification component for displaying transient error messages.
 *
 * The toaster reads `errorMessage` and `errorStatus` from the global context.
 * When `errorMessage` is set it renders a fixed-position banner in the
 * top-right corner of the viewport.  The banner auto-dismisses after
 * `toasterTimeout` milliseconds (defined in the shared constants) or can be
 * closed immediately by clicking the X button.
 *
 * Design decisions:
 *  - The component renders `null` when there is no message, so it has zero
 *    DOM footprint when idle.
 *  - "Unauthorized" errors are silently swallowed (also render null) because
 *    they are handled by the auth flow rather than shown to the user.
 *  - Server errors (status 500) get a "Server Error: " prefix so the user
 *    knows the problem is on the back-end, not something they did wrong.
 */

import React, { useContext, useEffect } from 'react';
import GlobalContext from '../globalContext';
import { actions, toasterTimeout } from '@photo-quest/shared';

/**
 * Renders a dismissible error toast notification.
 *
 * Subscribes to the global context for error state and automatically
 * dispatches ERROR_DISMISSED after the configured timeout.
 *
 * @returns {React.ReactElement | null} The toast banner, or null when there
 *   is nothing to display.
 */
export default function ToasterMessage() {
  /* Destructure dispatch and the two error-related state fields from the
   * global context.  We only need these two pieces of state, but
   * useContext always re-renders when *any* part of the context value
   * changes -- acceptable for now given the small state shape. */
  const { dispatch, state: { errorMessage, errorStatus } } = useContext(GlobalContext);

  /*
   * Auto-dismiss effect: whenever a new errorMessage appears, start a timer
   * that dispatches ERROR_DISMISSED after `toasterTimeout` ms.  The cleanup
   * function clears the timer if the component unmounts or the message
   * changes before the timeout fires (prevents stale dispatches).
   */
  useEffect(() => {
    if (!errorMessage) return;

    const timeoutId = setTimeout(
      () => dispatch({ type: actions.ERROR_DISMISSED }),
      toasterTimeout
    );

    /* Cleanup: cancel the pending timeout to avoid dispatching after unmount
     * or if a new error replaces the current one before the timer fires. */
    return () => clearTimeout(timeoutId);
  }, [errorMessage, dispatch]);

  /* Render nothing when there is no error, or when the error is an auth
   * failure (those are handled separately by the login flow). */
  if (!errorMessage || errorMessage === 'Unauthorized') return null;

  return (
    /* Fixed positioning + high z-index ensures the toast floats above all
     * page content regardless of scroll position. */
    <div className="fixed top-4 right-4 z-50 bg-red-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3">
      <p>
        {/* Prefix with "Server Error: " when the HTTP status was 500 so the
            user understands the fault lies with the back-end. */}
        {errorStatus === 500 ? 'Server Error: ' : ''}
        {errorMessage}
      </p>

      {/* Manual dismiss button -- dispatches the same action as the auto-
          dismiss timer so the reducer logic stays in one place. */}
      <button
        onClick={() => dispatch({ type: actions.ERROR_DISMISSED })}
        className="text-white hover:text-gray-200"
        title="Dismiss message"
      >
        &times;
      </button>
    </div>
  );
}
