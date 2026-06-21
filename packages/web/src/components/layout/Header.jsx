/**
 * @file App header with navigation.
 */

import { useState, useEffect } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { clientRoutes } from '@photo-quest/shared';
import { fetchNetworkInfo, pickLibraryFile, connectLibrary } from '../../utils/api.js';
import { Button, Icon, Modal } from '../ui/index.js';

/**
 * Navigation header component.
 */
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
    `px-4 py-2 rounded-lg transition-colors ${
      isActive
        ? 'bg-blue-600 text-white'
        : 'text-gray-300 hover:bg-gray-800 hover:text-white'
    }`;

  return (
    <header className="bg-gray-900 border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center">
            <Link to={clientRoutes.dashboard} className="text-xl font-bold text-white hover:text-gray-200 transition-colors">
              Photo Quest
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex items-center gap-2">
            <NavLink to={clientRoutes.dashboard} className={linkClass}>
              Library
            </NavLink>
            <NavLink to={clientRoutes.liked} className={linkClass}>
              Liked
            </NavLink>
          </nav>

          {/* Connect existing library */}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { setShowLibrary(true); setPickedPath(null); setLibraryStatus(null); }}
            title="Connect existing library"
            icon={<Icon name="folder" className="w-4 h-4" />}
          >
            Library
          </Button>

          {/* Network URL for other devices — desktop only */}
          {networkUrl && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowQr(true)}
                title="Show QR code for other devices"
                icon={<Icon name="network" className="w-4 h-4" />}
                className="hidden sm:inline-flex"
              >
                {networkUrl}
              </Button>

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
            </>
          )}
        </div>
      </div>

      {/* Rendered outside the flex row so StrictMode double-render doesn't stack two fixed overlays */}
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
    </header>
  );
}
