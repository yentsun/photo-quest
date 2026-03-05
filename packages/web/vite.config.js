/**
 * @file Vite configuration for the web package.
 *
 * Key decisions:
 *  - The React plugin enables Fast Refresh during development.
 *  - vite-plugin-pwa generates a service worker and web manifest so the
 *    app is installable as a PWA and auto-updates on new deployments.
 *  - The dev server listens on port 3000 so it does not collide with the
 *    API server on port 4000.
 *  - API requests (/media, /stream, /jobs) are proxied to the back-end.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      /* Auto-update: the new service worker takes over immediately
       * without waiting for all tabs to close. */
      registerType: 'autoUpdate',

      manifest: {
        short_name: 'Photo Quest',
        name: 'Photo Quest Media Library',
        start_url: '/',
        display: 'standalone',
        theme_color: '#000000',
        background_color: '#111827',
        icons: [
          {
            src: 'favicon.ico',
            sizes: '64x64 32x32 24x24 16x16',
            type: 'image/x-icon',
          },
          {
            src: 'logo192.png',
            type: 'image/png',
            sizes: '192x192',
          },
          {
            src: 'logo512.png',
            type: 'image/png',
            sizes: '512x512',
            purpose: 'any maskable',
          },
        ],
      },

      workbox: {
        /* Cache app shell (JS, CSS, HTML) for offline access. */
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],

        /* Don't cache API data endpoints -- they should always hit the server. */
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/media/, /^\/stream/, /^\/image/, /^\/jobs/],

        /* Runtime caching for viewed images - cache them for offline access. */
        runtimeCaching: [
          {
            urlPattern: /^\/image\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'media-images',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],

  server: {
    port: 3000,
    proxy: {
      '/media': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/stream': 'http://localhost:4000',
      '/image': 'http://localhost:4000',
      '/jobs': 'http://localhost:4000',
      '/network': 'http://localhost:4000',
    },
  },
});
