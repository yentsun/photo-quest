import { useState, useEffect, useCallback } from 'react';
import ConnectScreen from './ConnectScreen.jsx';
import { resolveApiUrl, setApiBase } from '../config/apiBase.js';

/**
 * Gate that decides whether the app can reach a server.
 *
 * Normal web/PWA: the server serves the app, so same-origin `/network` resolves
 * and we render the app immediately with no configuration.
 *
 * Bundled Capacitor: the UI is served from a local origin, so same-origin fails.
 * If an API base is already configured and reachable we go straight in; otherwise
 * we show the connect screen to pick a server (local / LAN / WireGuard).
 *
 * The reachability probe is quick (3s timeout) and only blocks rendering while
 * it is in flight, so the normal case adds no perceptible delay.
 */
export default function ServerGate({ children }) {
  const [state, setState] = useState('checking'); // checking | ready | connect

  const probe = useCallback(async () => {
    try {
      const res = await fetch(resolveApiUrl('/network'), { cache: 'no-store', signal: AbortSignal.timeout(3000) });
      if (res.ok) { setState('ready'); return; }
    } catch { /* fall through */ }

    /* Same-origin (or configured base) is unreachable. In the normal web/PWA case
       the server serves the app, so a dead origin means the app loaded from an
       unstable address — prefer discovery. In a bundled Capacitor app the UI is
       served locally and always needs a server picked. Either way show the connect
       screen so the user can choose local / LAN / WireGuard. */
    setState('connect');
  }, []);

  useEffect(() => {
    probe();
  }, [probe]);

  const onConnected = useCallback((url) => {
    setApiBase(url);
    setState('ready');
  }, []);

  if (state === 'checking') {
    return (
      <div className="connect-screen">
        <span className="spinner spinner-lg" />
      </div>
    );
  }

  if (state === 'connect') {
    return <ConnectScreen onConnected={onConnected} />;
  }

  return children;
}
