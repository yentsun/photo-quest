/**
 * @file Client-safe config defaults — no node:fs, no node:* imports.
 *
 * This file exists so that React Native (Metro) and web builds can import the
 * canonical server port without pulling node:fs into the bundle.
 *
 * Server processes use config.js (which reads the filesystem).
 * Clients use this file (static defaults).
 *
 * Phase 3 of issue #27.
 */

export default {
  serverPort: 7837,
  webappPort: 7838,
};
