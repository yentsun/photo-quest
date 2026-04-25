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
        runtimeCaching: [
          {
            urlPattern: /^\/image\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'media-images',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^\/stream\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'media-videos',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
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
