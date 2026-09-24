import { useEffect, useState } from 'react';
import { currentServerUrl, getKnownServers, normalizeServerUrl } from '../../services/serverPool.js';
import { fetchStorageStats } from '../../utils/api.js';
import { formatBytes } from '../../utils/format.js';
import { Badge, Button, Icon } from '../ui/index.js';
import { EmptyState } from '../layout/index.js';
import ServerDetailModal from '../ServerDetailModal.jsx';

const LOADING = 'loading';
const OK = 'ok';
const ERROR = 'error';

const PROBE_TIMEOUT = 10000;

/** Host (host:port) shown as a server's label. */
function serverHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** One-line storage summary for a server row. */
function serverSummary(server) {
  if (server.status === LOADING) return 'Checking…';
  if (server.status === ERROR) return 'Unreachable';
  const { stats } = server;
  const dbBytes = stats.db.bytes + stats.db.walBytes + stats.db.shmBytes;
  const onDisk = dbBytes + stats.thumbs.bytes + stats.transcodes.bytes + stats.originals.bytes;
  return `${formatBytes(onDisk)} on disk · ${stats.originals.count.toLocaleString()} items`;
}

function ServerRow({ server, onClick }) {
  return (
    <div className="server-row">
      <Button variant="ghost" className="server-row-head" onClick={onClick}>
        <span className="server-row-main">
          <Icon name="network" className="icon-sm" />
          <span className="server-row-text">
            <span className="server-row-url">{serverHost(server.url)}</span>
            <span className={`server-row-summary${server.status === ERROR ? ' server-status-error' : ''}`}>
              {serverSummary(server)}
            </span>
          </span>
        </span>
        <span className="server-row-tail">
          {server.current && <Badge variant="primary">This server</Badge>}
          <Icon name="next" className="icon-sm" />
        </span>
      </Button>
    </div>
  );
}

/** Connections view: every known server as a row; clicking one opens details. */
export default function ConnectionsPage() {
  const [servers, setServers] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const current = normalizeServerUrl(currentServerUrl());
    const urls = [];
    if (current) urls.push(current);
    for (const known of getKnownServers()) {
      const normalized = normalizeServerUrl(known);
      if (normalized && !urls.includes(normalized)) urls.push(normalized);
    }

    const initial = urls.map(url => ({
      url,
      current: url === current,
      status: LOADING,
      stats: null,
    }));
    setServers(initial);

    let cancelled = false;
    for (const entry of initial) {
      fetchStorageStats(entry.url, { timeout: PROBE_TIMEOUT })
        .then((stats) => {
          if (cancelled) return;
          setServers(prev => prev.map(s => (s.url === entry.url ? { ...s, status: OK, stats } : s)));
        })
        .catch(() => {
          if (cancelled) return;
          setServers(prev => prev.map(s => (s.url === entry.url ? { ...s, status: ERROR } : s)));
        });
    }
    return () => { cancelled = true; };
  }, []);

  /* Follow the latest stats for the open server instead of the snapshot taken
     when the row was clicked. */
  const selectedServer = selected
    ? servers.find(s => s.url === selected.url) ?? selected
    : null;

  const subtitle = servers.length === 0
    ? 'No servers known yet'
    : `${servers.length} server${servers.length !== 1 ? 's' : ''}`;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Connections</h1>
          <p className="page-subtitle">{subtitle}</p>
        </div>
      </div>

      {servers.length === 0 ? (
        <EmptyState
          icon={<Icon name="network" className="icon-2xl" />}
          title="No servers"
          description="Servers appear here once the app has learned about them."
        />
      ) : (
        <div className="server-list">
          {servers.map(server => (
            <ServerRow key={server.url} server={server} onClick={() => setSelected(server)} />
          ))}
        </div>
      )}

      <ServerDetailModal server={selectedServer} onClose={() => setSelected(null)} />
    </div>
  );
}
