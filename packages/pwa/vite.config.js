/**
 * @file Vite config for the autonomous PWA client.
 *
 * Unlike @photo-quest/web (thin client, proxies every request to the API
 * server), this package owns its own state locally and contacts the server
 * only for periodic sync. The dev server therefore proxies only the small
 * set of endpoints the sync layer needs — everything else is served by the
 * PWA itself from local storage / caches.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import config from '@photo-quest/shared/config.js';

const API_TARGET = `http://127.0.0.1:${config.serverPort}`;

const apiProxy = {
  '/sync':   API_TARGET,
  '/image':  API_TARGET,
  '/stream': API_TARGET,
};

export default defineConfig({
  define: {
    __SERVER_PORT__: JSON.stringify(config.serverPort),
  },

  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: true, type: 'module' },
      manifest: {
        short_name: 'Photo Quest',
        name: 'Photo Quest',
        start_url: '/',
        display: 'standalone',
        theme_color: '#000000',
        background_color: '#111827',
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        navigateFallback: '/index.html',
        /* Drop the previous `media-images` / `media-videos` runtime caches
         * the moment the new SW activates, so users transitioning from the
         * CacheFirst-on-/image/ build don't keep hitting stale entries. */
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        /* Media (`/image/`, `/stream/`) is intentionally NOT runtime-cached
         * here — IDB blobs (see localDb.js) are the offline cache. A SW
         * CacheFirst layer on top would double-cache, and its `Failed to
         * fetch` no-response wrapping masks legitimate online fetches
         * after a transient offline period. */
      },
    }),
  ],

  server: {
    host: true,
    port: config.webappPort,
    proxy: apiProxy,
  },

  preview: {
    host: true,
    port: config.webappPort,
    proxy: apiProxy,
  },
});
