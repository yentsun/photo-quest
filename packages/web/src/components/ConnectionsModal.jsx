import { useState, useEffect, useCallback } from 'react';
import { Modal, Button, Icon, Input, Badge } from './ui/index.js';
import { getApiBase, setApiBase } from '../config/apiBase.js';
import { useRefresh } from '../contexts/RefreshContext.jsx';
import { idbClearCache } from '../services/idb.js';
import { resetMediaCaches } from '../utils/api.js';
import {
  getKnownServers,
  getActiveServer,
  addKnownServer,
  removeKnownServer,
  normalizeServerUrl,
  currentServerUrl,
  probeServerUrl,
} from '../services/serverPool.js';

/**
 * The server the app is talking to right now. An empty base means the app was
 * served by the server itself (same-origin), so the page origin is the server.
 */
function currentBase() {
  return normalizeServerUrl(getApiBase()) || currentServerUrl();
}

/**
 * Connections view: every server the app knows about, which one is in use, and
 * whether each is currently reachable. Lets the user switch servers or forget a
 * stale address — the counterpart to the boot-time ConnectScreen for when the
 * app is already running.
 *
 * @param {{ open: boolean, onClose: () => void }} props
 */
export default function ConnectionsModal({ open, onClose }) {
  /** @type {[{ url: string, current: boolean, active: boolean, reachable: boolean|null }[], Function]} */
  const [rows, setRows] = useState([]);
  const [probing, setProbing] = useState(false);
  const [manual, setManual] = useState('');
  const [error, setError] = useState(null);
  const [showHidden, setShowHidden] = useState(false);
  const [cacheStatus, setCacheStatus] = useState(null);
  const { bump } = useRefresh();

  /* The current base is always listed first, then the known pool (deduped). */
  const buildRows = useCallback(() => {
    const configured = getApiBase();
    const current = normalizeServerUrl(configured) || currentServerUrl();
    const active = normalizeServerUrl(getActiveServer());
    const seen = new Set();
    const out = [];
    for (const candidate of [current, ...getKnownServers()]) {
      const url = normalizeServerUrl(candidate);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      out.push({
        url,
        current: url === current,
        /* With no configured base the app talks through the origin that served
           it — that is not a server address, and must not read like one. */
        sameOrigin: url === current && !configured,
        active: url === active,
        reachable: null,
      });
    }
    return out;
  }, []);

  /** Show the pool immediately, then fill in reachability as probes return. */
  const probeAll = useCallback(async () => {
    setProbing(true);
    setShowHidden(false);
    const base = buildRows();
    setRows(base);
    const probed = await Promise.all(
      base.map(async (row) => ({ ...row, reachable: await probeServerUrl(row.url) })),
    );
    setRows(probed);
    setProbing(false);
  }, [buildRows]);

  useEffect(() => {
    if (open) probeAll();
  }, [open, probeAll]);

  const handleUse = useCallback((url) => {
    if (url === currentBase()) { onClose(); return; }
    setApiBase(url);
    addKnownServer(url);
    /* Reload so every module that captured the old origin (IndexedDB caches,
       open SSE streams, in-memory media cache) starts fresh against the new
       server. */
    window.location.reload();
  }, [onClose]);

  const handleForget = useCallback((url) => {
    removeKnownServer(url);
    setRows((prev) => prev.filter((row) => row.url !== url));
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    setError(null);
    const url = normalizeServerUrl(manual);
    if (!url) { setError('Enter a full URL like http://192.168.1.50:7837'); return; }
    if (!(await probeServerUrl(url))) { setError('No server responded at that address'); return; }
    addKnownServer(url);
    setManual('');
    probeAll();
  };

  /* Local caches (IndexedDB snapshot + in-memory session) mirror the server;
     clearing them is a client-side action, so it lives with the server view. */
  const handleClearCache = async () => {
    setCacheStatus({ loading: true });
    try {
      await idbClearCache();
      resetMediaCaches();
      bump();
      setCacheStatus({ success: true });
      setTimeout(() => setCacheStatus(null), 2500);
    } catch (err) {
      setCacheStatus({ error: err.message });
    }
  };

  /* Only actual servers are listed: an address that does not answer is not a
     server. The current one always stays (the app is talking to it), and the
     hidden addresses can still be revealed to Forget them. */
  const hidden = rows.filter((row) => row.reachable === false && !row.current);
  const visible = showHidden ? rows : rows.filter((row) => row.reachable !== false || row.current);

  return (
    <Modal open={open} onClose={onClose} title="Connections">
      <div className="connections-section">
        <div className="connections-head">
          <span className="connections-hint">Servers this app can use</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={probeAll}
            disabled={probing}
            icon={<Icon name="refresh" className="icon-sm" />}
          >
            {probing ? 'Checking…' : 'Re-check'}
          </Button>
        </div>

        <div className="connections-list">
          {visible.length === 0 && <p className="text-mut">No servers found.</p>}
          {visible.map((row) => (
            <div
              key={row.url}
              className={`connections-row${row.current ? ' connections-row--current' : ''}`}
            >
              <span className="connections-url" title={row.url}>{row.url}</span>
              <span className="connections-actions">
                {row.current
                  ? <Badge variant="primary">{row.sameOrigin ? 'Current · same-origin' : 'Current'}</Badge>
                  : row.active && <Badge>Last used</Badge>}
                {row.reachable === true
                  ? <Badge variant="success">Online</Badge>
                  : row.reachable === false && <Badge variant="error">Offline</Badge>}
                {!row.current && (
                  <Button variant="ghost" size="sm" onClick={() => handleUse(row.url)}>Use</Button>
                )}
                {!row.current && (
                  <Button variant="ghost" size="sm" onClick={() => handleForget(row.url)}>Forget</Button>
                )}
              </span>
            </div>
          ))}
        </div>

        {hidden.length > 0 && (
          <p className="connections-hint">
            {hidden.length} unreachable address{hidden.length !== 1 ? 'es' : ''} hidden.{' '}
            <Button variant="text" size="sm" onClick={() => setShowHidden((v) => !v)}>
              {showHidden ? 'Hide' : 'Show'}
            </Button>
          </p>
        )}

        <form className="connections-add" onSubmit={handleAdd}>
          <Input
            placeholder="http://192.168.1.50:7837"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
          />
          <Button type="submit" size="sm" disabled={probing}>Add</Button>
        </form>
        {error && <p className="connect-error">{error}</p>}

        {rows.some((row) => row.sameOrigin) && (
          <p className="connections-hint">
            No server address is configured — the app reaches the server through its own origin.
          </p>
        )}

        <p className="connections-hint">
          Switching servers reloads the app. Media stays on your local network.
        </p>

        <div className="connections-head">
          <span className="connections-hint">Local cache</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearCache}
            disabled={cacheStatus?.loading}
            icon={<Icon name="refresh" className="icon-sm" />}
          >
            {cacheStatus?.loading ? 'Clearing…' : 'Clean cache'}
          </Button>
        </div>
        {cacheStatus?.success && (
          <p className="connections-hint">Cache cleared — data will reload from the server.</p>
        )}
        {cacheStatus?.error && <p className="connect-error">{cacheStatus.error}</p>}
      </div>
    </Modal>
  );
}
