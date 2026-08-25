import { useState, useEffect } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { clientRoutes } from '@photo-quest/shared';
import { fetchNetworkInfo, getCachedCounts, refreshCounts } from '../../utils/api.js';
import { addKnownServer, currentServerUrl } from '../../services/serverPool.js';
import { useRefresh } from '../../contexts/RefreshContext.jsx';
import { Button, Icon, Modal } from '../ui/index.js';

const NAV_ITEMS = [
  { to: clientRoutes.dashboard, icon: 'folder', label: 'Library', countKey: 'library' },
  { to: clientRoutes.liked, icon: 'heart', label: 'Liked', countKey: 'liked' },
  { to: clientRoutes.tags, icon: 'list', label: 'Tags', countKey: 'tags' },
];

export default function Header({ collapsed, onToggle }) {
  const [networkUrl, setNetworkUrl] = useState(null);
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const { signal, libraryCount, setLibraryCount, likedCount, setLikedCount, tagCount, setTagCount } = useRefresh();

  /* Load the per-section counts shown next to the nav items. These are cached
     (localStorage) so the badges render instantly on load, and are only
     refreshed against the cheap server COUNT endpoints on data-change signals —
     never by scanning the full media store. */
  useEffect(() => {
    const cached = getCachedCounts();
    if (cached.library != null) setLibraryCount(cached.library);
    if (cached.liked != null) setLikedCount(cached.liked);
    if (cached.tags != null) setTagCount(cached.tags);
  }, [setLibraryCount, setLikedCount, setTagCount]);

  useEffect(() => {
    let cancelled = false;
    refreshCounts().then((counts) => {
      if (cancelled) return;
      if (counts.library != null) setLibraryCount(counts.library);
      if (counts.liked != null) setLikedCount(counts.liked);
      if (counts.tags != null) setTagCount(counts.tags);
    });
    return () => { cancelled = true; };
  }, [signal, setLibraryCount, setLikedCount, setTagCount]);

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

  const handleCopyUrl = async () => {
    if (!networkUrl) return;
    try {
      /* Clipboard API is only available in secure contexts; over plain HTTP
         fall back to a temporary textarea + execCommand('copy'). */
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(networkUrl);
      } else {
        const ta = document.createElement('textarea');
        ta.value = networkUrl;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy URL:', err);
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
          {NAV_ITEMS.map((item) => {
            const activeClass = ({ isActive }) => `nav-item${isActive ? ' active' : ''}`;
            const count =
              item.countKey === 'library' ? libraryCount
              : item.countKey === 'liked' ? likedCount
              : tagCount;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={activeClass}
                title={collapsed ? item.label : undefined}
              >
                <Icon name={item.icon} className="icon-sm" />
                <span className="nav-label">{item.label}</span>
                {count != null && (
                  <span className="nav-count">{count.toLocaleString()}</span>
                )}
              </NavLink>
            );
          })}
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
            Your browser can't show the automatic install prompt right now, but you can add Photo Quest
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
