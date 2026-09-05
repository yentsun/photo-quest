import { useState, useEffect, useCallback } from 'react';
import { setApiBase } from '../config/apiBase.js';
import { getKnownServers, addKnownServer, currentServerUrl } from '../services/serverPool.js';
import { Button, Icon, Input, Modal } from './ui/index.js';

/**
 * True when running inside a native Capacitor WebView (bundled app) rather than a
 * browser tab. In that mode the UI is served from a local origin and the API base
 * must be configured explicitly; in the normal web/PWA case the server serves the
 * app, so no config is needed.
 */
function isNativeApp() {
  return typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();
}

function normalize(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return `${u.origin}/`;
  } catch {
    return null;
  }
}

/** Resolve the /network payload for a candidate base, or null if unreachable. */
async function fetchNetworkFor(base) {
  try {
    const res = await fetch(`${base}network`, { cache: 'no-store', signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default function ConnectScreen({ onConnected }) {
  const [candidates, setCandidates] = useState([]);
  const [manual, setManual] = useState('');
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [showManual, setShowManual] = useState(false);
  const [testing, setTesting] = useState(null);

  /* Gather candidate servers: the current origin (that served this page), any
     known servers, and — if a server is already reachable — every address it
     advertises (localhost, LAN, WireGuard) via /network. */
  const refreshCandidates = useCallback(async () => {
    const origin = currentServerUrl();
    const list = [];
    const seen = new Set();
    const push = (url) => {
      const n = normalize(url);
      if (n && !seen.has(n)) { seen.add(n); list.push(n); }
    };

    push(origin);
    for (const s of getKnownServers()) push(s);

    /* If the current origin (or any known server) is up, read its advertised
       addresses so local/LAN/WG are all offered. */
    for (const candidate of list.slice()) {
      const net = await fetchNetworkFor(candidate);
      if (net?.local) push(net.local);
      if (net?.canonical) push(net.canonical);
      if (net?.network) push(net.network);
      for (const alt of net?.alternatives ?? []) push(alt);
    }

    setCandidates(list);
    setSelected(list[0] ?? null);
  }, []);

  useEffect(() => { refreshCandidates(); }, [refreshCandidates]);

  const handleConnect = useCallback(async (url) => {
    setBusy(true);
    setError(null);
    setTesting(url);
    try {
      const net = await fetchNetworkFor(url);
      if (!net) throw new Error('No server responded at that address');
      addKnownServer(url);
      /* Seed the pool with every address the server advertises. */
      if (net.local) addKnownServer(net.local);
      if (net.canonical) addKnownServer(net.canonical);
      for (const alt of net?.alternatives ?? []) addKnownServer(alt);
      setApiBase(url);
      onConnected?.(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      setTesting(null);
    }
  }, [onConnected]);

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    const url = normalize(manual);
    if (!url) { setError('Enter a full URL like http://192.168.1.50:7837'); return; }
    await handleConnect(url);
  };

  return (
    <div className="connect-screen">
      <div className="connect-card">
        <div className="connect-logo">
          <img src="/favicon.png" alt="" />
        </div>
        <h1 className="connect-title">Connect to your library</h1>
        <p className="connect-sub text-mut">
          {isNativeApp()
            ? 'Your media never leaves your network. Choose where your Photo Quest server is running.'
            : 'Your library server was not reachable. Choose a server below.'}
        </p>

        {/* Discovered servers */}
        <div className="connect-list">
          {candidates.length === 0 && !busy && (
            <p className="text-mut">No servers found. Enter the address of your Photo Quest server.</p>
          )}
          {candidates.map((c) => (
            <button
              key={c}
              className={`connect-item${selected === c ? ' connect-item--active' : ''}`}
              onClick={() => setSelected(c)}
              type="button"
            >
              <Icon name="network" className="icon-sm" />
              <span className="connect-item-url">{c}</span>
            </button>
          ))}
        </div>

        {error && <p className="connect-error">{error}</p>}

        <div className="connect-actions">
          <Button
            variant="primary"
            size="lg"
            disabled={!selected || busy}
            onClick={() => handleConnect(selected)}
            icon={busy && testing === selected ? <span className="spinner spinner-sm" /> : <Icon name="connect" className="icon-sm" />}
          >
            {busy && testing === selected ? 'Connecting…' : 'Connect'}
          </Button>
          <Button variant="ghost" size="lg" onClick={() => setShowManual(true)}>
            <Icon name="plus" className="icon-sm" />
            Enter address
          </Button>
        </div>
      </div>

      <Modal open={showManual} onClose={() => setShowManual(false)} title="Connect to server">
        <form onSubmit={handleManualSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input
            autoFocus
            placeholder="http://192.168.1.50:7837"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
          />
          {error && <p className="connect-error">{error}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="ghost" type="button" onClick={() => setShowManual(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Connecting…' : 'Connect'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
