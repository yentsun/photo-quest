/**
 * @file Application entry point for the React web client.
 *
 * This is the first file that Vite loads (configured via the HTML entry in
 * index.html).  Its only job is to mount the React component tree into the
 * DOM.
 *
 * React.StrictMode is enabled to surface potential problems during
 * development -- it intentionally double-invokes certain lifecycle methods
 * and effects so that impure code is easier to spot.  StrictMode has zero
 * effect in production builds.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';

/* Global Tailwind / reset styles -- must be imported before any component so
 * that utility classes are available everywhere. */
import './index.css';

/* The top-level Router component owns global state (via useReducer) and sets
 * up React Router.  Every page in the app is rendered inside it. */
import Router from './components/Router';

/**
 * Create a concurrent-mode root attached to the #root div in index.html and
 * render the entire application.  `createRoot` (React 18+) enables automatic
 * batching and concurrent features.
 */
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <Router />
  </React.StrictMode>
);
