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
import config from '@photo-quest/shared/config.defaults';

const { serverPort } = config;

export function getApiBaseUrl() {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
    const { hostname, port } = window.location;
    if (port === String(serverPort)) return '';
    return `http://${hostname}:${serverPort}`;
  }
  const host = Constants.expoConfig?.hostUri?.split(':')?.[0];
  return `http://${host ?? 'localhost'}:${serverPort}`;
}
