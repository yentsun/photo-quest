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

  const linkClass = ({ isActive }) =>
    `flex items-center px-3 py-2 rounded-lg transition-colors w-full text-sm ${
      isActive
        ? 'bg-blue-600 text-white'
        : 'text-gray-300 hover:bg-gray-800 hover:text-white'
    }`;

  return (
    <>
      <aside className="fixed left-0 top-0 bottom-0 w-52 bg-gray-900 border-r border-gray-800 flex flex-col z-20">
        {/* Logo */}
        <div className="p-4 border-b border-gray-800">
          <Link
            to={clientRoutes.dashboard}
            className="flex items-center gap-2 text-lg font-bold text-white hover:text-gray-200 transition-colors"
          >
            <img src="/favicon.png" alt="" className="w-7 h-7" />
            Photo Quest
          </Link>
        </div>

        {/* Nav links */}
        <nav className="flex-1 p-3 flex flex-col gap-1">
          <NavLink to={clientRoutes.dashboard} className={linkClass}>
            Library
          </NavLink>
          <NavLink to={clientRoutes.liked} className={linkClass}>
            Liked
          </NavLink>
          <NavLink to={clientRoutes.tags} className={linkClass}>
            Tags
          </NavLink>
        </nav>

        {/* Bottom actions */}
        <div className="p-3 border-t border-gray-800 flex flex-col gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { setShowLibrary(true); setPickedPath(null); setLibraryStatus(null); }}
            title="Connect existing library"
            icon={<Icon name="folder" className="w-4 h-4" />}
            className="w-full"
          >
            Library
          </Button>

          {networkUrl && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowQr(true)}
              title="Show QR code for other devices"
              icon={<Icon name="network" className="w-4 h-4" />}
              className="w-full"
            >
              <span className="truncate">{networkUrl}</span>
            </Button>
          )}
        </div>
      </aside>

      {/* Modals */}
      {networkUrl && (
        <Modal open={showQr} onClose={() => setShowQr(false)} title="Open on another device">
          <div className="flex flex-col items-center gap-4">
            <div className="p-4 bg-white rounded-xl">
              <QRCodeSVG value={networkUrl} size={220} />
            </div>
            <p className="text-gray-400 text-sm text-center">{networkUrl}</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCopyUrl}
              icon={<Icon name="copy" className="w-4 h-4" />}
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
        <div className="flex flex-col gap-4">
          <p className="text-gray-400 text-sm">
            Select a <code className="text-gray-300">.db</code> file from a previous Photo Quest installation to open that library.
          </p>
          <Button variant="secondary" onClick={handlePickLibrary} icon={<Icon name="folder" className="w-4 h-4" />}>
            Browse…
          </Button>
          {pickedPath && (
            <p className="text-sm text-gray-300 break-all bg-gray-800 rounded px-3 py-2">{pickedPath}</p>
          )}
          {libraryStatus?.error && (
            <p className="text-sm text-red-400">{libraryStatus.error}</p>
          )}
          {libraryStatus?.success && (
            <p className="text-sm text-green-400">Library connected — the app is restarting…</p>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setShowLibrary(false)}>Cancel</Button>
            <Button
              onClick={handleConnectLibrary}
              disabled={!pickedPath || libraryStatus?.loading || libraryStatus?.success}
            >
              {libraryStatus?.loading ? 'Connecting…' : 'Connect'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
