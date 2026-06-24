import { useState, useEffect, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './layout/index.js';
import { IconButton, Icon, Spinner } from './ui/index.js';
import { useRefresh } from '../contexts/RefreshContext.jsx';
import { useScan } from '../contexts/ScanContext.jsx';
import { JobProgressContext } from '../contexts/JobProgressContext.jsx';
import { cancelScan } from '../utils/api.js';

function ImportProgressBar({ onJobProgress, onJobDone }) {
  const [progress, setProgress] = useState(null);
  const { bump } = useRefresh();
  const { setIsScanning } = useScan();

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
          if (data.type === 'job_progress') onJobProgress(data.mediaId, data.progress);
          if (data.type === 'job_done') { onJobDone(data.mediaId); setTimeout(bump, 300); }
        } catch { /* ignore parse errors */ }
      };

      es.onerror = () => { es.close(); reconnectTimer = setTimeout(connect, 3000); };
    };

    connect();
    return () => { destroyed = true; clearTimeout(reconnectTimer); es?.close(); };
  }, [bump, setIsScanning, syncFromServer, onJobProgress, onJobDone]);

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
        <Spinner size="sm" />
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
  const [jobProgress, setJobProgress] = useState(new Map());

  const handleJobProgress = useCallback((mediaId, progress) => {
    setJobProgress(prev => { const next = new Map(prev); next.set(mediaId, progress); return next; });
  }, []);

  const handleJobDone = useCallback((mediaId) => {
    setJobProgress(prev => { const next = new Map(prev); next.delete(mediaId); return next; });
  }, []);

  return (
    <JobProgressContext.Provider value={jobProgress}>
      <div className="app">
        <Header />
        <div className="app-body">
          <ImportProgressBar onJobProgress={handleJobProgress} onJobDone={handleJobDone} />
          <main className="main-area">
            <Outlet />
          </main>
        </div>
      </div>
    </JobProgressContext.Provider>
  );
}
