import { useState, useEffect, useCallback, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Header } from './layout/index.js';
import { IconButton, Icon, ProgressBar } from './ui/index.js';
import { useRefresh } from '../contexts/RefreshContext.jsx';
import { useScan } from '../contexts/ScanContext.jsx';
import { useJobProgressUpdater } from '../contexts/JobProgressContext.jsx';
import { cancelScan } from '../utils/api.js';

function ImportProgressBar() {
  const [progress, setProgress] = useState(null);
  const trackedScanRef = useRef(null);
  const { bump } = useRefresh();
  const { setIsScanning } = useScan();
  const { update: updateProgress, clear: clearProgress } = useJobProgressUpdater();

  const syncFromServer = useCallback(() => {
    fetch('/scans')
      .then(r => r.json())
      .then(scans => {
        const active = scans.find(s => s.status === 'importing' || s.status === 'discovering');
        if (active) {
          trackedScanRef.current = active.id;
          setProgress({ total: active.total, processed: active.processed, scanId: active.id });
          setIsScanning(true);
        } else {
          trackedScanRef.current = null;
          setProgress(null);
          setIsScanning(false);
        }
      })
      .catch(() => {});
  }, [setIsScanning]);

  useEffect(() => {
    let es = null;
    let reconnectTimer = null;
    let destroyed = false;

    const connect = () => {
      if (destroyed) return;
      syncFromServer();
      es = new EventSource('/jobs/events');

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'import_started') {
            if (trackedScanRef.current == null) {
              trackedScanRef.current = data.scanId;
              setProgress({ total: data.total, processed: data.processed, scanId: data.scanId });
              setIsScanning(true);
            }
            return;
          }

          if (data.type === 'import_progress') {
            if (data.scanId !== trackedScanRef.current) return;
            setProgress({ total: data.total, processed: data.processed, scanId: data.scanId });
            setIsScanning(true);
            if (data.processed - (progress?.lastBump ?? 0) >= 50) {
              setProgress(p => p ? { ...p, lastBump: data.processed } : p);
              bump();
            }
            return;
          }

          if (data.type === 'import_complete' || data.type === 'import_cancelled') {
            if (data.scanId !== trackedScanRef.current) return;
            trackedScanRef.current = null;
            setProgress(null);
            setIsScanning(false);
            setTimeout(bump, 500);
            return;
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

  useEffect(() => {
    if (progress && trackedScanRef.current == null) {
      const interval = setInterval(() => {
        syncFromServer();
        if (trackedScanRef.current != null) clearInterval(interval);
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [progress, syncFromServer]);

  const handleCancel = useCallback(async () => {
    const scanId = progress?.scanId ?? trackedScanRef.current;
    if (!scanId) return;
    try {
      await cancelScan(scanId);
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
        <ProgressBar value={pct} width={20} showPct={false} />
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
