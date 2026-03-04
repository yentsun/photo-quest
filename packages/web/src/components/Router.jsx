/**
 * @file Top-level routing and global state provider.
 *
 * This component sits at the very top of the React tree (just below
 * StrictMode in main.jsx) and is responsible for three things:
 *
 *  1. **Global state** -- it creates the `useReducer` store and wraps the
 *     whole app in `<GlobalContext.Provider>` so that any descendant can read
 *     state or dispatch actions.
 *
 *  2. **Client-side routing** -- it sets up React Router's `<BrowserRouter>`
 *     and declares every route the app supports.
 *
 *  3. **Cross-cutting UI** -- it renders the `<ToasterMessage>` (always
 *     present, renders nothing when there is no error) and the
 *     `<ErrorBoundary>` that catches unhandled exceptions.
 */

import React, { useReducer } from 'react';
import { Routes, Route, BrowserRouter, Navigate } from 'react-router-dom';
import GlobalContext, { initialState, reducer } from '../globalContext';
import { clientRoutes as r } from '@photo-quest/shared';
import ErrorBoundary from './ErrorBoundary';
import Root from './Root';
import Dashboard from './Dashboard';
import ToasterMessage from './ToasterMessage';

/**
 * Root-level component that wires together global state, routing, and
 * app-wide UI chrome (toaster, error boundary).
 *
 * @returns {React.ReactElement} The fully-composed application shell.
 */
export default function Router() {
  /*
   * useReducer is preferred over useState here because the global state shape
   * will grow over time and the reducer pattern keeps updates predictable and
   * testable (each action is a discrete, replayable event).
   */
  const [state, dispatch] = useReducer(reducer, initialState);

  return (
    /* Provide { state, dispatch } to the entire component tree. */
    <GlobalContext.Provider value={{ state, dispatch }}>
      {/* Toaster sits outside the router so it is always visible regardless
          of the current route. */}
      <ToasterMessage />

      {/* ErrorBoundary catches render-time exceptions from any route and
          shows a recovery screen rather than a white page. */}
      <ErrorBoundary>
        <BrowserRouter>
          <Routes>
            {/* The Root route is a layout wrapper -- it renders an <Outlet>
                that child routes fill in. */}
            <Route path={r.root} element={<Root />}>
              {/* Visiting "/" redirects to the dashboard.  `replace` prevents
                  the redirect from being added to the browser history stack. */}
              <Route index element={<Navigate replace to={r.dashboard} />} />

              {/* The main content page. */}
              <Route path={r.dashboard} element={<Dashboard />} />
            </Route>

            {/* Catch-all: any unrecognised path redirects to the root. */}
            <Route path="*" element={<Navigate to={r.root} />} />
          </Routes>
        </BrowserRouter>
      </ErrorBoundary>
    </GlobalContext.Provider>
  );
}
