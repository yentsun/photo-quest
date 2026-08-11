/**
 * @file Resolves the API base URL per platform.
 *
 * Web (prod): the API server serves the exported web build itself, so API
 * calls are same-origin ('').
 * Web (dev): Metro serves the app on its own port — point at the API server.
 * Native (dev): derive the dev-machine host from Expo's hostUri.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';

/* Mirrors the serverPort default in packages/shared/config.js.
 * Phase 3 splits that file into a client-safe entry (it currently imports
 * node:fs, which Metro cannot bundle); until then keep the constant local. */
const SERVER_PORT = 7837;

export function getApiBaseUrl() {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
    const { hostname, port } = window.location;
    if (port === String(SERVER_PORT)) return '';
    return `http://${hostname}:${SERVER_PORT}`;
  }
  const host = Constants.expoConfig?.hostUri?.split(':')?.[0];
  return `http://${host ?? 'localhost'}:${SERVER_PORT}`;
}
