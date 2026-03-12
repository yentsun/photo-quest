/**
 * @file App header with navigation.
 */

import { useState, useEffect } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { clientRoutes } from '@photo-quest/shared';
import { fetchNetworkInfo } from '../../utils/api.js';
import { Button, Icon } from '../ui/index.js';

/**
 * Navigation header component.
 */
export default function Header() {
  const [networkUrl, setNetworkUrl] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchNetworkInfo()
      .then(info => setNetworkUrl(info.network))
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
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleCopyUrl}
                title="Click to copy network URL for other devices"
                icon={<Icon name="network" className="w-4 h-4" />}
              >
                <span className="hidden sm:inline">{networkUrl}</span>
                <span className="sm:hidden">Network</span>
                {copied && <span className="text-green-400 text-xs ml-1">Copied!</span>}
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
