import { useState, useEffect } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { clientRoutes } from '@photo-quest/shared';
import { fetchNetworkInfo } from '../../utils/api.js';
import { Button, Icon, Modal } from '../ui/index.js';

export default function Header({ collapsed, onToggle }) {
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

  return (
    <>
      <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`}>
        <div className="sidebar-logo">
          <Link to={clientRoutes.dashboard} title={collapsed ? 'Photo Quest' : undefined}>
            <img src="/favicon.png" alt="" />
            <span className="sidebar-title-group">
              <span className="nav-label">Photo Quest</span>
              <span className="nav-label version-label">v{import.meta.env.VITE_APP_VERSION}</span>
            </span>
          </Link>
        </div>

        <nav className="sidebar-nav">
          <NavLink
            to={clientRoutes.dashboard}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            title={collapsed ? 'Library' : undefined}
          >
            <Icon name="folder" className="icon-sm" />
            <span className="nav-label">Library</span>
          </NavLink>
          <NavLink
            to={clientRoutes.liked}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            title={collapsed ? 'Liked' : undefined}
          >
            <Icon name="heart" className="icon-sm" />
            <span className="nav-label">Liked</span>
          </NavLink>
          <NavLink
            to={clientRoutes.tags}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            title={collapsed ? 'Tags' : undefined}
          >
            <Icon name="list" className="icon-sm" />
            <span className="nav-label">Tags</span>
          </NavLink>
          <NavLink
            to={clientRoutes.transcodes}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            title={collapsed ? 'Transcodes' : undefined}
          >
            <Icon name="refresh" className="icon-sm" />
            <span className="nav-label">Transcodes</span>
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          {networkUrl && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowQr(true)}
              title="Show QR code for other devices"
              icon={<Icon name="network" className="icon-sm" />}
              className="btn-full"
            >
              <span className="nav-label" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{networkUrl}</span>
            </Button>
          )}

          <button className="sidebar-toggle" onClick={onToggle} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            <Icon name={collapsed ? 'next' : 'prev'} className="icon-sm" />
          </button>
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
    </>
  );
}
