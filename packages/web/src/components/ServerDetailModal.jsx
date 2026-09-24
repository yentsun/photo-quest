import { useEffect, useState } from 'react';
import { useRefresh } from '../contexts/RefreshContext.jsx';
import { idbClearCache } from '../services/idb.js';
import {
  connectLibrary,
  downloadLibraryBackup,
  downloadMediaManifest,
  fetchLibraryStatus,
  pickLibraryFile,
  resetMediaCaches,
} from '../utils/api.js';
import { formatBytes } from '../utils/format.js';
import { Button, Icon, Loader, Modal, ProgressBar } from './ui/index.js';

const LOADING = 'loading';
const ERROR = 'error';

/** Full storage report for one device. */
function DeviceStorage({ device }) {
  if (device.status === LOADING) {
    return <Loader message="Reading storage…" />;
  }
  if (device.status === ERROR) {
    return (
      <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--sol-red)' }}>
        Could not reach this server.
      </p>
    );
  }

  const { stats } = device;
  return (
    <>
      <dl className="storage-rows">
        <div className="storage-row">
          <dt>Database</dt>
          <dd title="Includes the write-ahead log">
            {formatBytes(stats.db.bytes + stats.db.walBytes + stats.db.shmBytes)}
          </dd>
        </div>
        <div className="storage-row">
          <dt>Thumbnails</dt>
          <dd>
            {formatBytes(stats.thumbs.bytes)}
            <span className="storage-row-note"> · {stats.thumbs.count.toLocaleString()} files</span>
          </dd>
        </div>
        <div className="storage-row">
          <dt>Transcoded</dt>
          <dd>
            {formatBytes(stats.transcodes.bytes)}
            <span className="storage-row-note"> · {stats.transcodes.count.toLocaleString()} files</span>
          </dd>
        </div>
        <div className="storage-row">
          <dt>Originals</dt>
          <dd>
            {formatBytes(stats.originals.bytes)}
            <span className="storage-row-note">
              {' · '}{stats.originals.images.toLocaleString()} images,{' '}
              {stats.originals.videos.toLocaleString()} videos
            </span>
          </dd>
        </div>
      </dl>

      {stats.volumes.map((volume) => (
        <div className="storage-volume" key={volume.path}>
          <div className="storage-volume-head">
            <span className="storage-volume-path" title={volume.path}>{volume.path}</span>
            <span>{formatBytes(volume.free)} free of {formatBytes(volume.total)}</span>
          </div>
          <ProgressBar value={volume.used} max={volume.total} width={20} />
        </div>
      ))}
    </>
  );
}

/**
 * Detail modal for one device: its addresses and storage report, plus the
 * library/database controls when it is the server the app is connected to.
 *
 * @param {{ device: Object|null, onClose: Function }} props
 */
export default function ServerDetailModal({ device, onClose }) {
  const { bump } = useRefresh();
  const [libraryInfo, setLibraryInfo] = useState(null);
  const [libraryError, setLibraryError] = useState(null);
  const [pickedPath, setPickedPath] = useState(null);
  const [libraryStatus, setLibraryStatus] = useState(null);
  const [cacheStatus, setCacheStatus] = useState(null);
  const [backupStatus, setBackupStatus] = useState(null);
  const [manifestStatus, setManifestStatus] = useState(null);

  /* Reset when a different device is opened. Keyed by id so that a storage
     stats update on the same device (which replaces the object) does not clear
     the library state fetched below. */
  useEffect(() => {
    setLibraryInfo(null);
    setLibraryError(null);
    setPickedPath(null);
    setLibraryStatus(null);
    setCacheStatus(null);
    setBackupStatus(null);
    setManifestStatus(null);

    if (!device || !device.current) return;
    let cancelled = false;
    fetchLibraryStatus()
      .then((info) => { if (!cancelled) setLibraryInfo(info); })
      .catch((err) => { if (!cancelled) setLibraryError(err.message); });
    return () => { cancelled = true; };
  }, [device?.id, device?.current]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBackupDatabase = async () => {
    setBackupStatus({ loading: true });
    try {
      await downloadLibraryBackup();
      setBackupStatus({ success: true });
    } catch (err) {
      console.error('Failed to download database backup:', err);
      setBackupStatus({ error: err.message });
    }
  };

  const handleDownloadManifest = async (format) => {
    setManifestStatus({ loading: true });
    try {
      await downloadMediaManifest(format);
      setManifestStatus({ success: true });
    } catch (err) {
      console.error('Failed to download media manifest:', err);
      setManifestStatus({ error: err.message });
    }
  };

  const handlePickLibrary = async () => {
    setLibraryStatus(null);
    setPickedPath(null);
    try {
      const result = await pickLibraryFile();
      if (!result.cancelled) setPickedPath(result.path);
    } catch (err) {
      setLibraryStatus({ error: err.message });
    }
  };

  const handleConnectLibrary = async () => {
    if (!pickedPath) return;
    setLibraryStatus({ loading: true });
    try {
      await connectLibrary(pickedPath);
      setLibraryStatus({ success: true });
    } catch (err) {
      setLibraryStatus({ error: err.message });
    }
  };

  const handleClearCache = async () => {
    setCacheStatus({ loading: true });
    try {
      await idbClearCache();
      resetMediaCaches();
      setCacheStatus({ success: true });
      bump();
      /* Invalidate the in-memory session cache so the next fetch is fresh. */
      setTimeout(() => setCacheStatus(null), 2500);
    } catch (err) {
      setCacheStatus({ error: err.message });
    }
  };

  return (
    <Modal open={!!device} onClose={onClose} title={device ? device.name : ''}>
      {device && (
        <>
          <section className="storage-section">
            <p className="storage-title">Addresses</p>
            <ul className="server-addresses">
              {device.urls.map((url) => (
                <li key={url} className={url === device.best ? 'server-address server-address-best' : 'server-address'}>
                  <span className="server-address-url" title={url}>{url}</span>
                  {url === device.best && <span className="server-address-tag">in use</span>}
                </li>
              ))}
            </ul>
          </section>

          <section className="storage-section">
            <p className="storage-title">Storage</p>
            <DeviceStorage device={device} />
          </section>

          {device.current && (
            <>
              <div className="library-info">
                <p className="library-info-label">Currently connected</p>
                {libraryInfo ? (
                  <>
                    <p className="library-info-name">{libraryInfo.name}</p>
                    <p className="library-info-path" title={libraryInfo.path}>{libraryInfo.path}</p>
                    {libraryInfo.items != null && (
                      <p className="library-info-meta">{libraryInfo.items.toLocaleString()} items</p>
                    )}
                  </>
                ) : libraryError ? (
                  <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--sol-red)' }}>
                    Could not load connection info: {libraryError}
                  </p>
                ) : (
                  <p className="text-mut" style={{ fontSize: 'var(--fs-sm)' }}>Loading…</p>
                )}
              </div>

              <section className="storage-section">
                <p className="storage-title">Backup</p>
                <div className="storage-backups">
                  <Button
                    variant="ghost"
                    onClick={handleBackupDatabase}
                    disabled={backupStatus?.loading}
                    icon={<Icon name="database" className="icon-sm" />}
                  >
                    {backupStatus?.loading ? 'Preparing…' : 'Database backup'}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => handleDownloadManifest('csv')}
                    disabled={manifestStatus?.loading}
                    icon={<Icon name="download" className="icon-sm" />}
                  >
                    {manifestStatus?.loading ? 'Preparing…' : 'Manifest (CSV)'}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => handleDownloadManifest('json')}
                    disabled={manifestStatus?.loading}
                  >
                    Manifest (JSON)
                  </Button>
                </div>
                {backupStatus?.success && (
                  <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--sol-green)' }}>Database backup downloaded.</p>
                )}
                {backupStatus?.error && (
                  <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--sol-red)' }}>{backupStatus.error}</p>
                )}
                {manifestStatus?.success && (
                  <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--sol-green)' }}>Manifest downloaded.</p>
                )}
                {manifestStatus?.error && (
                  <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--sol-red)' }}>{manifestStatus.error}</p>
                )}
                <p className="text-mut" style={{ fontSize: 'var(--fs-xs)' }}>
                  The database backup is a consistent snapshot of your library. The manifest lists every
                  media file's path and metadata — the files themselves stay where they are.
                </p>
              </section>

              <p className="text-mut" style={{ fontSize: 'var(--fs-sm)' }}>
                Open a different <code style={{ color: 'var(--sol-text-em)' }}>.db</code> file from another Photo Quest installation to switch the connection.
              </p>
              <Button variant="ghost" onClick={handlePickLibrary} icon={<Icon name="database" className="icon-sm" />}>
                Open another connection…
              </Button>
              {pickedPath && <div className="path-preview">{pickedPath}</div>}
              <Button variant="ghost" onClick={handleClearCache} disabled={cacheStatus?.loading} icon={<Icon name="refresh" className="icon-sm" />}>
                {cacheStatus?.loading ? 'Clearing…' : 'Clean cache'}
              </Button>
              {cacheStatus?.success && (
                <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--sol-green)' }}>Cache cleared — data will reload from the server.</p>
              )}
              {cacheStatus?.error && (
                <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--sol-red)' }}>{cacheStatus.error}</p>
              )}
              {libraryStatus?.error && (
                <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--sol-red)' }}>{libraryStatus.error}</p>
              )}
              {libraryStatus?.success && (
                <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--sol-green)' }}>Connection switched — the app is restarting…</p>
              )}
            </>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={onClose}>Close</Button>
            {device.current && (
              <Button
                variant="primary"
                onClick={handleConnectLibrary}
                disabled={!pickedPath || libraryStatus?.loading || libraryStatus?.success}
              >
                {libraryStatus?.loading ? 'Connecting…' : 'Switch to this connection'}
              </Button>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
