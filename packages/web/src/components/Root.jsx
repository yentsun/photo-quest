import { useState, useEffect, useCallback } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Header } from './layout/index.js';
import { IconButton, Icon } from './ui/index.js';
import { useRefresh } from '../contexts/RefreshContext.jsx';
import { useScan } from '../contexts/ScanContext.jsx';
import { useJobProgressUpdater } from '../contexts/JobProgressContext.jsx';
import { cancelScan } from '../utils/api.js';

function ImportProgressBar() {
  const [progress, setProgress] = useState(null);
  const { bump } = useRefresh();
  const { setIsScanning } = useScan();
  const { update: updateProgress, clear: clearProgress } = useJobProgressUpdater();

  const syncFromServer = useCallback(() => {
    fetch('/scans')
      .then(r => r.json())
      .then(scans => {
        const active = scans.find(s => s.status === 'importing' || s.status === 'discovering');
        if (active) {
          setProgress({ total: active.total, processed: active.processed, scanId: active.id });
          setIsScanning(true);
        } else {
          setProgress(null);
          setIsScanning(false);
        }
      })
      .catch(() => {});
  }, [setIsScanning]);

  useEffect(() => {
    let es = null;
    let reconnectTimer = null;
    let lastBump = 0;
    let destroyed = false;

    const connect = () => {
      if (destroyed) return;
      syncFromServer();
      es = new EventSource('/jobs/events');

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'import_started' || data.type === 'import_progress') {
            setProgress({ total: data.total, processed: data.processed, scanId: data.scanId });
            setIsScanning(true);
            if (data.processed - lastBump >= 50) { lastBump = data.processed; bump(); }
          }
          if (data.type === 'import_complete' || data.type === 'import_cancelled') {
            setProgress(null);
            setIsScanning(false);
            lastBump = 0;
            setTimeout(bump, 500);
          }
          if (data.type === 'transcode_progress') {
            updateProgress(data.mediaId, data.progressSecs);
          }
          if (data.type === 'transcode_complete') {
            clearProgress(data.mediaId);
          }
        } catch { /* ignore parse errors */ }
      };

      es.onerror = () => { es.close(); reconnectTimer = setTimeout(connect, 3000); };
    };

    connect();
    return () => { destroyed = true; clearTimeout(reconnectTimer); es?.close(); };
  }, [bump, setIsScanning, syncFromServer, updateProgress, clearProgress]);

  const handleCancel = useCallback(async () => {
    if (!progress?.scanId) return;
    try {
      await cancelScan(progress.scanId);
    } catch (err) {
      if (!err.message?.includes('already')) console.error('Failed to cancel scan:', err);
    }
  }, [progress?.scanId]);

  if (!progress) return null;

  const pct = progress.total ? (progress.processed / progress.total) * 100 : 0;

  return (
    <div className="import-bar">
      <div className="import-bar-inner">
        <span className="spinner spinner-sm" />
        <span className="import-bar-text">
          Importing… {progress.processed}/{progress.total}
        </span>
        <div className="progress-track" style={{ flex: 1 }}>
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <IconButton
          icon={<Icon name="close" className="icon-sm" />}
          label="Stop import"
          size="sm"
          onClick={handleCancel}
        />
      </div>
    </div>
  );
}

export default function Root() {
  const location = useLocation();
  const isViewer = location.pathname.startsWith('/media/');
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === 'true');

  const toggleSidebar = useCallback(() => {
    setCollapsed(c => {
      const next = !c;
      localStorage.setItem('sidebar-collapsed', next);
      return next;
    });
  }, []);

  return (
    <div className={`app${isViewer ? ' app--viewer' : ''}`} style={collapsed ? { '--sidebar-w': '52px' } : undefined}>
      <Header collapsed={collapsed} onToggle={toggleSidebar} />
      <div className="app-body">
        <ImportProgressBar />
        <main className="main-area">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
