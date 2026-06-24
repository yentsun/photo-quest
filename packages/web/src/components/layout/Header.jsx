import { useState, useEffect } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { clientRoutes } from '@photo-quest/shared';
import { fetchNetworkInfo, pickLibraryFile, connectLibrary } from '../../utils/api.js';
import { Button, Icon, Modal } from '../ui/index.js';

export default function Header() {
  const [networkUrl, setNetworkUrl] = useState(null);
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [pickedPath, setPickedPath] = useState(null);
  const [libraryStatus, setLibraryStatus] = useState(null);

  useEffect(() => {
    fetchNetworkInfo()
      .then(info => {
        if (info.ip) {
          const port = window.location.port;
          setNetworkUrl(`http://${info.ip}${port ? `:${port}` : ''}`);
        }
      })
      .catch(err => console.error('Failed to fetch network info:', err));
  }, []);

  const handleCopyUrl = () => {
    if (networkUrl) {
      navigator.clipboard.writeText(networkUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-logo">
          <Link to={clientRoutes.dashboard}>
            <img src="/favicon.png" alt="" />
            Photo Quest
          </Link>
        </div>

        <nav className="sidebar-nav">
          <NavLink
            to={clientRoutes.dashboard}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <Icon name="folder" className="icon-sm" />
            Library
          </NavLink>
          <NavLink
            to={clientRoutes.liked}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <Icon name="heart" className="icon-sm" />
            Liked
          </NavLink>
          <NavLink
            to={clientRoutes.tags}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <Icon name="list" className="icon-sm" />
            Tags
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setShowLibrary(true); setPickedPath(null); setLibraryStatus(null); }}
            title="Connect existing library"
            icon={<Icon name="folder" className="icon-sm" />}
            className="btn-full"
          >
            Library
          </Button>

          {networkUrl && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowQr(true)}
              title="Show QR code for other devices"
              icon={<Icon name="network" className="icon-sm" />}
              className="btn-full"
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{networkUrl}</span>
            </Button>
          )}
        </div>
      </aside>

      {networkUrl && (
        <Modal open={showQr} onClose={() => setShowQr(false)} title="Open on another device">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div style={{ padding: 16, background: '#fff' }}>
              <QRCodeSVG value={networkUrl} size={220} />
            </div>
            <p className="text-mut" style={{ fontSize: 'var(--fs-sm)', textAlign: 'center' }}>{networkUrl}</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyUrl}
              icon={<Icon name="copy" className="icon-sm" />}
            >
              {copied ? 'Copied!' : 'Copy URL'}
            </Button>
          </div>
        </Modal>
      )}

      <Modal
        open={showLibrary}
        onClose={() => setShowLibrary(false)}
        title="Connect existing library"
      >
        <p className="text-mut" style={{ fontSize: 'var(--fs-sm)' }}>
          Select a <code style={{ color: 'var(--sol-text-em)' }}>.db</code> file from a previous Photo Quest installation to open that library.
        </p>
        <Button variant="ghost" onClick={handlePickLibrary} icon={<Icon name="folder" className="icon-sm" />}>
          Browse…
        </Button>
        {pickedPath && (
          <div className="path-preview">{pickedPath}</div>
        )}
        {libraryStatus?.error && (
          <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--sol-red)' }}>{libraryStatus.error}</p>
        )}
        {libraryStatus?.success && (
          <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--sol-green)' }}>Library connected — the app is restarting…</p>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={() => setShowLibrary(false)}>Cancel</Button>
          <Button
            variant="primary"
            onClick={handleConnectLibrary}
            disabled={!pickedPath || libraryStatus?.loading || libraryStatus?.success}
          >
            {libraryStatus?.loading ? 'Connecting…' : 'Connect'}
          </Button>
        </div>
      </Modal>
    </>
  );
}
