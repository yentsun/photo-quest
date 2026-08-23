import { useState, useEffect } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { clientRoutes } from '@photo-quest/shared';
import { fetchNetworkInfo } from '../../utils/api.js';
import { addKnownServer, currentServerUrl } from '../../services/serverPool.js';
import { Button, Icon, Modal } from '../ui/index.js';

export default function Header({ collapsed, onToggle }) {
  const [networkUrl, setNetworkUrl] = useState(null);
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    /* Always record the current origin — it is the server when the app is
       served from it, even if the /network LAN probe fails. */
    addKnownServer(currentServerUrl());
    fetchNetworkInfo()
      .then(info => {
        if (info.ip) {
          const port = window.location.port;
          setNetworkUrl(`http://${info.ip}${port ? `:${port}` : ''}`);
        } else {
          setNetworkUrl(window.location.origin);
        }
      })
      .catch(err => {
        console.error('Failed to fetch network info:', err);
        setNetworkUrl(window.location.origin);
      });
  }, []);

  /* Remember the server's reachable addresses so discovery can fall back to
     them later if this origin becomes unreachable. */
  useEffect(() => {
    if (networkUrl) addKnownServer(networkUrl);
  }, [networkUrl]);

  /* PWA installability: capture the prompt and surface an Install button. */
  useEffect(() => {
    const onBeforeInstall = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    const onInstalled = () => {
      setInstallPrompt(null);
      setIsInstalled(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    /* Detect that the app is already running standalone (installed). */
    const mq = window.matchMedia('(display-mode: standalone)');
    setIsInstalled(mq.matches || window.navigator.standalone === true);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      await installPrompt.userChoice;
      /* prompt() can only be invoked once per beforeinstallprompt event; clear
         the button regardless of outcome so a dismissed dialog doesn't leave a
         dead button behind. */
      setInstallPrompt(null);
    } else {
      /* Over plain HTTP the browser never fires beforeinstallprompt; fall back
         to manual 'Add to Home screen' instructions. */
      setShowInstallHelp(true);
    }
  };

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
          {!isInstalled && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleInstall}
              title="Install Photo Quest as an app"
              icon={<Icon name="download" className="icon-sm" />}
              className="btn-full"
            >
              <span className="nav-label">Install app</span>
            </Button>
          )}

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

      <Modal open={showInstallHelp} onClose={() => setShowInstallHelp(false)} title="Install Photo Quest">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 'var(--fs-sm)' }}>
          <p className="text-mut">
            Over a local HTTP connection the browser can't install the app automatically, but you can add it
            to your home screen manually:
          </p>
          <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6, color: 'var(--sol-text-em)' }}>
            <li>Open this page in <strong>Chrome</strong> (Android) or <strong>Safari</strong> (iPhone/iPad).</li>
            <li>Tap the browser menu (⋮ or share button).</li>
            <li>Choose <strong>Add to Home screen</strong>.</li>
          </ol>
          <p className="text-mut">
            For a true standalone install (with an automatic install prompt), serve the app over HTTPS —
            e.g. via a reverse proxy or tunnel — and the <strong>Install app</strong> button will trigger the
            native prompt instead.
          </p>
        </div>
      </Modal>
    </>
  );
}
