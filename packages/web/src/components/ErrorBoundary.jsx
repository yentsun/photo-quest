/**
 * @file React error boundary -- the app-wide crash safety net.
 *
 * Error boundaries are class components (React does not yet support the
 * equivalent lifecycle hooks in function components).  This boundary wraps
 * the entire router so that an unhandled exception in *any* component is
 * caught here rather than tearing down the whole React tree and leaving the
 * user with a blank white screen.
 *
 * Recovery strategy:
 *  - Display a friendly error page with instructions (reload, go home).
 *  - Clear all localStorage via `clearStorage()`.  The rationale is that
 *    corrupted cached state is a common cause of render-time exceptions, so
 *    wiping it gives the user the best chance of recovering after a reload.
 *  - Show the raw error in a collapsed `<details>` block for debugging.
 */

import React from 'react';
import { clientRoutes as r } from '@photo-quest/shared';
import GlobalContext from '../globalContext';
import { clearStorage } from '../keep';

/**
 * Class-based error boundary component.
 *
 * Renders its children normally until a descendant throws during rendering,
 * in a lifecycle method, or in a constructor.  At that point it switches to
 * the fallback error UI.
 *
 * NOTE: Error boundaries do *not* catch errors in event handlers, async code,
 * or server-side rendering.  Those need separate try/catch handling.
 */
export default class ErrorBoundary extends React.Component {
  /**
   * Bind the global context so we can (in the future) dispatch error actions
   * or read state when rendering the fallback UI.
   */
  static contextType = GlobalContext;

  /**
   * @param {Object} props - Standard React props (expects `children`).
   */
  constructor(props) {
    super(props);

    /** @type {{ hasError: boolean, error: Error | null, errorInfo: React.ErrorInfo | null }} */
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  /**
   * React lifecycle hook called when a descendant throws.
   *
   * We capture both the error object and the componentStack info so that
   * the fallback UI can display them.  We also nuke localStorage because
   * stale / corrupt cached data is the most common cause of render crashes.
   *
   * @param {Error}           error     - The thrown error.
   * @param {React.ErrorInfo} errorInfo - Contains `componentStack`, a string
   *   describing which component in the tree threw.
   */
  componentDidCatch(error, errorInfo) {
    this.setState({ hasError: true, error, errorInfo });

    /* Wipe localStorage to eliminate corrupt cached state as a possible cause.
     * The user will need to log in again, but that is preferable to an
     * infinite crash loop. */
    clearStorage();
  }

  /**
   * Render either the children (happy path) or the error recovery UI.
   */
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white p-8">
          <div className="max-w-md">
            <h2 className="text-2xl font-bold mb-4">Something went wrong</h2>

            {/* Simple recovery instructions -- keep these short and
                actionable so the user knows what to do next. */}
            <ul className="space-y-2 text-gray-300">
              <li>Reload the page (press <code className="bg-gray-700 px-1 rounded">F5</code>)</li>
              <li><a href={r.root} className="text-blue-400 underline">Go home</a></li>
            </ul>

            {/* Collapsible error details for developers / bug reports. */}
            <details className="mt-4 text-sm text-gray-500">
              <summary>Error details</summary>
              <pre className="mt-2 whitespace-pre-wrap">{this.state.error?.toString()}</pre>
            </details>
          </div>
        </div>
      );
    }

    /* No error -- render children as normal. */
    return this.props.children;
  }
}
