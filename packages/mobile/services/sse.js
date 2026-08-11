/**
 * @file SSE client with automatic reconnection — mirrors Root.jsx pattern.
 */
import { Platform } from 'react-native';

/**
 * @param {string}   url       SSE endpoint (e.g. '/jobs/events')
 * @param {Function} onMessage receives parsed JSON
 * @param {Function} onError   optional error handler
 * @returns {{ close: Function }}
 */
export function createSSE(url, onMessage, onError) {
  if (Platform.OS === 'web') {
    let es;
    let reconnectTimer = null;
    let destroyed = false;

    const connect = () => {
      if (destroyed) return;
      es = new EventSource(url);
      es.onmessage = (event) => {
        try { onMessage(JSON.parse(event.data)); } catch {}
      };
      es.onerror = () => {
        es.close();
        if (!destroyed) {
          reconnectTimer = setTimeout(connect, 3000);
        }
        onError?.(new Error('SSE connection lost'));
      };
    };

    connect();

    return {
      close() {
        destroyed = true;
        clearTimeout(reconnectTimer);
        es?.close();
      },
    };
  }

  // Native: polling-based SSE fallback
  let destroyed = false;
  let timer = null;
  const controller = new AbortController();

  const poll = async () => {
    if (destroyed) return;
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      for (const chunk of text.split('\n\n')) {
        if (chunk.startsWith('data:')) {
          try { onMessage(JSON.parse(chunk.slice(5).trim())); } catch {}
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') onError?.(err);
    }
    if (!destroyed) timer = setTimeout(poll, 2000);
  };

  poll();

  return {
    close() {
      destroyed = true;
      clearTimeout(timer);
      controller.abort();
    },
  };
}
