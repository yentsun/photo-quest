/**
 * @file Vite configuration for the web package.
 *
 * Vite is the build tool and dev server for the React front-end.  This config
 * is intentionally minimal -- Vite's sensible defaults handle most things.
 *
 * Key decisions:
 *  - The React plugin (@vitejs/plugin-react) enables Fast Refresh (hot module
 *    replacement for React components) during development.
 *  - The dev server listens on port 3000 so it does not collide with the API
 *    server on port 4000.
 *  - API requests (/media, /stream, /jobs) are proxied to the back-end
 *    server.  This avoids CORS issues in development and mirrors the
 *    production setup where a reverse proxy would do the same thing.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  /* Enable the official React plugin for JSX transform and Fast Refresh. */
  plugins: [react()],

  server: {
    /* Fixed port so scripts and bookmarks stay stable across restarts. */
    port: 3000,

    /**
     * Proxy configuration: requests to API paths are forwarded to the
     * back-end at http://localhost:4000.  This way the front-end can use
     * simple relative URLs (e.g. `fetch('/media')`) without worrying
     * about cross-origin restrictions during local dev.
     */
    proxy: {
      '/media': 'http://localhost:4000',
      '/stream': 'http://localhost:4000',
      '/jobs': 'http://localhost:4000'
    }
  }
});
