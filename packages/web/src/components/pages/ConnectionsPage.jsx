import { useEffect, useState } from 'react';
import { currentServerUrl, getKnownServers, normalizeServerUrl } from '../../services/serverPool.js';
import { fetchServerInfo, fetchStorageStats } from '../../utils/api.js';
import { formatBytes } from '../../utils/format.js';
import { Badge, Button, Icon, Loader } from '../ui/index.js';
import { EmptyState } from '../layout/index.js';
import ServerDetailModal from '../ServerDetailModal.jsx';

const LOADING = 'loading';
const OK = 'ok';
const ERROR = 'error';

/* Network identities are cheap; storage stats stat files on disk, so the two
   use different budgets. */
const IDENTITY_TIMEOUT = 4000;
const STORAGE_TIMEOUT = 10000;

/** Host (host:port) shown when a server has no reported name. */
function serverHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** One-line storage summary for a device row. */
function deviceSummary(device) {
  if (device.status === LOADING) return 'Checking…';
  if (device.status === ERROR) return 'Unreachable';
  const { stats } = device;
  const dbBytes = stats.db.bytes + stats.db.walBytes + stats.db.shmBytes;
  const onDisk = dbBytes + stats.thumbs.bytes + stats.transcodes.bytes + stats.originals.bytes;
  return `${formatBytes(onDisk)} on disk · ${stats.originals.count.toLocaleString()} items`;
}

function ServerRow({ device, onClick }) {
  return (
    <div className="server-row">
      <Button variant="ghost" className="server-row-head" onClick={onClick}>
        <span className="server-row-main">
          <Icon name="network" className="icon-sm" />
          <span className="server-row-text">
            <span className="server-row-url">{device.name}</span>
            <span className={`server-row-summary${device.status === ERROR ? ' server-status-error' : ''}`}>
              {deviceSummary(device)}
            </span>
          </span>
        </span>
        <span className="server-row-tail">
          {device.current && <Badge variant="primary">This server</Badge>}
          <Icon name="next" className="icon-sm" />
        </span>
      </Button>
    </div>
  );
}

/**
 * Build every candidate server URL: the current origin first, then the known
 * pool, deduped.
 */
function candidateUrls() {
  const current = normalizeServerUrl(currentServerUrl());
  const urls = [];
  if (current) urls.push(current);
  for (const known of getKnownServers()) {
    const normalized = normalizeServerUrl(known);
    if (normalized && !urls.includes(normalized)) urls.push(normalized);
  }
  return { current, urls };
}

/**
 * Collapse the candidates into one entry per device (by reported name), so the
 * same server reached through several addresses shows as a single row.
 */
async function groupDevices(urls, current) {
  const infos = await Promise.all(urls.map(async (url) => {
    try {
      const info = await fetchServerInfo(url, { timeout: IDENTITY_TIMEOUT });
      return { url, reachable: true, name: info?.name || null };
    } catch {
      return { url, reachable: false, name: null };
    }
  }));

  const groups = new Map();
  for (const info of infos) {
    const key = info.name || info.url;
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        name: info.name || serverHost(info.url),
        urls: [],
        reachableUrls: [],
        current: false,
      });
    }
    const group = groups.get(key);
    group.urls.push(info.url);
    if (info.reachable) group.reachableUrls.push(info.url);
    if (info.url === current) group.current = true;
  }

  return [...groups.values()].map((group) => {
    const best = group.current && group.reachableUrls.includes(current)
      ? current
      : (group.reachableUrls[0] || group.urls[0]);
    return {
      ...group,
      best,
      status: group.reachableUrls.length > 0 ? LOADING : ERROR,
      stats: null,
    };
  });
}

/** Connections view: one row per server; clicking a row opens its details. */
export default function ConnectionsPage() {
  const [devices, setDevices] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { current, urls } = candidateUrls();
    if (urls.length === 0) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    groupDevices(urls, current).then((grouped) => {
      if (cancelled) return;
      setDevices(grouped);
      setLoading(false);

      for (const device of grouped) {
        if (device.status === ERROR) continue;
        fetchStorageStats(device.best, { timeout: STORAGE_TIMEOUT })
          .then((stats) => {
            if (cancelled) return;
            setDevices(prev => prev.map(d => (d.id === device.id ? { ...d, status: OK, stats } : d)));
          })
          .catch(() => {
            if (cancelled) return;
            setDevices(prev => prev.map(d => (d.id === device.id ? { ...d, status: ERROR } : d)));
          });
      }
    });

    return () => { cancelled = true; };
  }, []);

  /* Follow the latest stats for the open device instead of the snapshot taken
     when the row was clicked. */
  const selectedDevice = selected
    ? devices.find(d => d.id === selected.id) ?? selected
    : null;

  const subtitle = loading
    ? 'Finding servers…'
    : devices.length === 0
      ? 'No servers known yet'
      : `${devices.length} server${devices.length !== 1 ? 's' : ''}`;

  if (loading) return <div className="page-loader"><Loader message="Finding servers…" /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Connections</h1>
          <p className="page-subtitle">{subtitle}</p>
        </div>
      </div>

      {devices.length === 0 ? (
        <EmptyState
          icon={<Icon name="network" className="icon-2xl" />}
          title="No servers"
          description="Servers appear here once the app has learned about them."
        />
      ) : (
        <div className="server-list">
          {devices.map(device => (
            <ServerRow key={device.id} device={device} onClick={() => setSelected(device)} />
          ))}
        </div>
      )}

      <ServerDetailModal device={selectedDevice} onClose={() => setSelected(null)} />
    </div>
  );
}
