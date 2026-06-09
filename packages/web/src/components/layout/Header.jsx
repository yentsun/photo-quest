/**
 * @file App header with navigation.
 */

import { useState, useEffect } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { clientRoutes } from '@photo-quest/shared';
import { fetchNetworkInfo } from '../../utils/api.js';
import { Button, Icon, Modal } from '../ui/index.js';

/**
 * Navigation header component.
 */
export default function Header() {
  const [networkUrl, setNetworkUrl] = useState(null);
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);

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

          {/* Network URL for other devices */}
          {networkUrl && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowQr(true)}
                title="Show QR code for other devices"
                icon={<Icon name="network" className="w-4 h-4" />}
              >
                <span className="hidden sm:inline">{networkUrl}</span>
                <span className="sm:hidden">Network</span>
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
    </header>
  );
}
