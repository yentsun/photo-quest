import { useState, useEffect, useCallback, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Header } from './layout/index.js';
import { IconButton, Icon, ProgressBar } from './ui/index.js';
import { useRefresh } from '../contexts/RefreshContext.jsx';
import { useScan } from '../contexts/ScanContext.jsx';
import { useJobs, useJobProgressUpdater } from '../contexts/JobProgressContext.jsx';
import { fetchJobs, cancelScan } from '../utils/api.js';
import { JOB_STATUS } from '@photo-quest/shared';

/**
 * Global refresh/import toaster. Surfaces two things as fixed-position toasts
 * (bottom-right, stacking on top of each other):
 *
 *  1. Live import progress — "Importing… N/M" with an animated progress bar and
 *     a Stop button — shown for the duration of an active scan.
 *  2. Transient status messages — "Refreshing library…", "Imported N files.",
 *     refresh failures, etc. — surfaced via the ScanContext by Dashboard.
 *
 * Auto-dismisses: the status message clears on a timer; progress disappears
 * when the tracked scan completes or is cancelled.
 */
function RefreshToaster() {
  const [progress, setProgress] = useState(null);
  const trackedScanRef = useRef(null);
  const { bump } = useRefresh();
  const { isScanning, setIsScanning, statusMessage } = useScan();

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
        } catch { /* ignore parse errors */ }
      };

      es.onerror = () => { es.close(); reconnectTimer = setTimeout(connect, 3000); };
    };

    connect();
    return () => { destroyed = true; clearTimeout(reconnectTimer); es?.close(); };
  }, [bump, setIsScanning, syncFromServer]);

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

  const pct = progress?.total ? (progress.processed / progress.total) * 100 : 0;

  return (
    <div className="refresh-toaster-stack">
      {trackedScanRef.current != null && (
        <div className="toaster toaster-info refresh-toaster">
          <span className="spinner spinner-sm" />
          <div className="refresh-toaster-body">
            <p className="refresh-toaster-title">
              Importing… {progress ? `${progress.processed}/${progress.total}` : ''}
            </p>
            <ProgressBar value={pct} width={20} showPct={false} />
          </div>
          <IconButton
            icon={<Icon name="close" className="icon-sm" />}
            label="Stop import"
            size="sm"
            onClick={handleCancel}
          />
        </div>
      )}
      {!isScanning && statusMessage && (
        <div className="toaster toaster-info refresh-toaster">
          <div className="refresh-toaster-body">
            <p className="refresh-toaster-title">{statusMessage}</p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Non-blocking transcode indicator. Shows the currently-running job with a
 * progress bar and a queued count, so the user can keep browsing the app.
 * Auto-dismisses when no transcode is active.
 */
function TranscodeToaster() {
  const jobs = useJobs();
  const running = jobs.find(j => j.status === JOB_STATUS.RUNNING);
  const queued = jobs.filter(j => j.status === JOB_STATUS.PENDING).length;
  const active = running || queued > 0;

  if (!active) return null;

  return (
    <div className="toaster toaster-transcode">
      {running ? (
        <>
          <span className="spinner spinner-sm" />
          <div className="toaster-transcode-body">
            <p>Transcoding "{running.title}"…</p>
            {running.progress != null
              ? <ProgressBar value={running.progress} width={20} showPct={false} />
              : <ProgressBar width={20} indeterminate showPct={false} />}
          </div>
        </>
      ) : (
        <span className="spinner spinner-sm" />
      )}
      {queued > 0 && <span className="toaster-transcode-queued">{queued} queued</span>}
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
        <main className="main-area">
          <Outlet />
        </main>
      </div>
      <RefreshToaster />
    </div>
  );
}
