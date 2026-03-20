/**
 * @file Vite configuration for the web package.
 *
 * Key decisions:
 *  - The React plugin enables Fast Refresh during development.
 *  - vite-plugin-pwa generates a service worker and web manifest so the
 *    app is installable as a PWA and auto-updates on new deployments.
 *  - The dev server listens on port 5000 so it does not collide with the
 *    API server (PORT env var, defaults to 3000).
 *  - API requests (/media, /stream, /jobs, /scans) are proxied to the back-end.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import config from '@photo-quest/shared/config.js';

const API_TARGET = `http://localhost:${config.serverPort}`;

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
        navigateFallbackDenylist: [/^\/media\/(?!\d+$)/, /^\/stream/, /^\/image/, /^\/jobs/, /^\/folders/],

        /* Runtime caching — serve previously viewed media offline (LAW 1.29). */
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
          {
            urlPattern: /^\/stream\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'media-videos',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^\/media$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'media-api',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^\/folders$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'folders-api',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
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
    port: config.webappPort,
    proxy: {
      /* Proxy /media requests to the API, but skip /media/:id (digits only)
       * which is a client route for the unified viewer. */
      '/media': {
        target: API_TARGET,
        bypass(req) {
          /* Bypass GET /media/:id for browser navigation (client route).
           * Fetch/XHR requests (Accept: application/json) go to the API. */
          if (req.method === 'GET' && /^\/media\/\d+$/.test(req.url)
              && !req.headers.accept?.includes('application/json')) {
            return req.url;
          }
        },
      },
      '/stream': API_TARGET,
      '/image': API_TARGET,
      '/jobs': API_TARGET,
      '/folders': API_TARGET,
      '/network': API_TARGET,
      '/scans': API_TARGET,
    },
  },
});
