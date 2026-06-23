import { useState, useEffect, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './layout/index.js';
import { IconButton, Icon } from './ui/index.js';
import { useRefresh } from '../contexts/RefreshContext.jsx';
import { useScan } from '../contexts/ScanContext.jsx';
import { JobProgressContext } from '../contexts/JobProgressContext.jsx';
import { cancelScan } from '../utils/api.js';

function ImportProgressBar({ onJobProgress, onJobDone }) {
  const [progress, setProgress] = useState(null); // { total, processed, scanId }
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
            if (data.processed - lastBump >= 50) {
              lastBump = data.processed;
              bump();
            }
          }
          if (data.type === 'import_complete' || data.type === 'import_cancelled') {
            setProgress(null);
            setIsScanning(false);
            lastBump = 0;
            setTimeout(bump, 500);
          }
          if (data.type === 'job_progress') {
            onJobProgress(data.mediaId, data.progress);
          }
          if (data.type === 'job_done') {
            onJobDone(data.mediaId);
            setTimeout(bump, 300);
          }
        } catch { /* ignore parse errors */ }
      };

      es.onerror = () => {
        es.close();
        reconnectTimer = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      destroyed = true;
      clearTimeout(reconnectTimer);
      es?.close();
    };
  }, [bump, setIsScanning, syncFromServer, onJobProgress, onJobDone]);

  const handleCancel = useCallback(async () => {
    if (!progress?.scanId) return;
    try {
      await cancelScan(progress.scanId);
    } catch (err) {
      if (!err.message?.includes('already')) {
        console.error('Failed to cancel scan:', err);
      }
    }
  }, [progress?.scanId]);

  if (!progress) return null;

  const pct = progress.total ? (progress.processed / progress.total) * 100 : 0;

  return (
    <div className="bg-blue-900/50 border-b border-blue-700/50 px-4 py-2">
      <div className="max-w-7xl mx-auto flex items-center gap-3">
        <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
        <span className="text-blue-300 text-sm">
          Importing... {progress.processed}/{progress.total}
        </span>
        <div className="flex-1 bg-gray-700 rounded-full h-1.5">
          <div
            className="bg-blue-500 h-1.5 rounded-full transition-all duration-200"
            style={{ width: `${pct}%` }}
          />
        </div>
        <IconButton
          icon={<Icon name="close" />}
          label="Stop import"
          size="sm"
          onClick={handleCancel}
          className="!bg-transparent !text-blue-300 hover:!text-white"
        />
      </div>
    </div>
  );
}

export default function Root() {
  const [jobProgress, setJobProgress] = useState(new Map());

  const handleJobProgress = useCallback((mediaId, progress) => {
    setJobProgress(prev => {
      const next = new Map(prev);
      next.set(mediaId, progress);
      return next;
    });
  }, []);

  const handleJobDone = useCallback((mediaId) => {
    setJobProgress(prev => {
      const next = new Map(prev);
      next.delete(mediaId);
      return next;
    });
  }, []);

  return (
    <JobProgressContext.Provider value={jobProgress}>
      <div className="h-screen bg-gray-900 flex overflow-hidden">
        <Header />
        <div className="flex-1 flex flex-col pl-52 min-h-0">
          <ImportProgressBar onJobProgress={handleJobProgress} onJobDone={handleJobDone} />
          <main className="flex-1 overflow-y-auto min-h-0">
            <Outlet />
          </main>
        </div>
      </div>
    </JobProgressContext.Provider>
  );
}
