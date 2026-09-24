import { useState, useEffect, useCallback } from 'react';
import config from '@photo-quest/shared/config.defaults';
import { setApiBase } from '../config/apiBase.js';
import { getKnownServers, addKnownServer, currentServerUrl, fetchServerNetwork } from '../services/serverPool.js';
import { Button, Icon, Input, Modal } from './ui/index.js';

/* The server's port is a constant, documented identity. In a bundled/static
 * shell the UI runs on a different port (or origin) and `/network` is
 * unreachable, so this is the only hint we have for where the library lives. */
const SERVER_PORT = config.serverPort;

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

/** Resolve the /network payload for a candidate base, or null if unreachable
 *  or not actually a Photo Quest server. */
async function fetchNetworkFor(base) {
  return fetchServerNetwork(base, { timeout: 4000 });
}

export default function ConnectScreen({ onConnected }) {
  const [candidates, setCandidates] = useState([]);
  const [reachable, setReachable] = useState([]);
  const [manual, setManual] = useState('');
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [showManual, setShowManual] = useState(false);
  const [testing, setTesting] = useState(null);

  /* Gather candidate servers: the current origin (that served this page), any
     known servers, the page host on the server port, and — from any server that
     does answer — every address it advertises (localhost, LAN, WireGuard).
     Reachable candidates are surfaced first so the default selection works. */
  const refreshCandidates = useCallback(async () => {
    const list = [];
    const seen = new Set();
    const push = (url) => {
      const n = normalize(url);
      if (n && !seen.has(n)) { seen.add(n); list.push(n); }
    };

    /* Addresses remembered from earlier sessions. An entry here is only a hint:
       it may no longer be running (or may be a UI origin the old client wrongly
       recorded), so it is listed only when it actually answers. */
    const remembered = new Set(getKnownServers().map(normalize).filter(Boolean));

    push(currentServerUrl());
    for (const s of remembered) push(s);

    /* The UI origin is not the server in a static/bundled shell, so also try the
       same host (and localhost) on the server's fixed port. */
    const host = window.location.hostname;
    push(`http://localhost:${SERVER_PORT}/`);
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      push(`http://${host}:${SERVER_PORT}/`);
    }

    const probed = await Promise.all(list.map(async (url) => ({ url, net: await fetchNetworkFor(url) })));
    const up = [];
    for (const { url, net } of probed) {
      if (!net) continue;
      up.push(url);
      if (net.local) push(net.local);
      if (net.canonical) push(net.canonical);
      if (net.network) push(net.network);
      for (const alt of net.alternatives ?? []) push(alt);
    }

    const isUp = (url) => up.includes(url);
    const ordered = [...list]
      /* Drop remembered addresses that do not answer — but never hide the fixed
         port hints or a live server's own advertised addresses. */
      .filter((url) => isUp(url) || !remembered.has(url))
      .sort((a, b) => (isUp(b) ? 1 : 0) - (isUp(a) ? 1 : 0));
    setCandidates(ordered);
    setReachable(up);
    setSelected(ordered[0] ?? null);
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
              {!reachable.includes(c) && <span className="connect-item-offline">offline</span>}
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
