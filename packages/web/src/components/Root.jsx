/**
 * @file Root layout component.
 *
 * This component acts as the layout shell for every page in the app.  React
 * Router renders it for the "/" path and injects the matched child route via
 * the `<Outlet>` component.
 *
 * Includes the persistent Header navigation and global import progress bar.
 */

import { useState, useEffect, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './layout/index.js';
import { IconButton, Icon } from './ui/index.js';
import { useRefresh } from '../contexts/RefreshContext.jsx';
import { useScan } from '../contexts/ScanContext.jsx';
import { cancelScan } from '../utils/api.js';

/**
 * Global import progress bar that listens to SSE for any active imports.
 * Also keeps ScanContext in sync so other components (e.g. Dashboard) know
 * whether a scan is running without having to duplicate SSE logic.
 * LAW 1.33: import progress must always be visible.
 */
function ImportProgressBar() {
  const [progress, setProgress] = useState(null); // { total, processed, scanId }
  const { bump } = useRefresh();
  const { setIsScanning } = useScan();

  /**
   * Check /scans for any active import and sync state.
   * Called on mount and after every SSE reconnect so stale progress
   * is cleared if the scan finished while the connection was down.
   */
  const syncFromServer = useCallback(() => {
    fetch('/scans')
      .then(r => r.json())
      .then(scans => {
        const active = scans.find(s => s.status === 'importing' || s.status === 'discovering');
        if (active) {
          setProgress({ total: active.total, processed: active.processed, scanId: active.id });
          setIsScanning(true);
        } else {
          /* No active scan — clear any stale progress left from a dropped connection. */
          setProgress(null);
          setIsScanning(false);
        }
      })
      .catch(() => {});
  }, [setIsScanning]);

  /* SSE listener with auto-reconnect. On every (re)connect we sync from
     the server first so stale state is cleared if the scan finished while
     the connection was down. */
  useEffect(() => {
    let es = null;
    let reconnectTimer = null;
    let lastBump = 0;
    let destroyed = false;

    const connect = () => {
      if (destroyed) return;

      /* Sync current scan state before opening SSE — clears stale progress. */
      syncFromServer();

      es = new EventSource('/jobs/events');

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'import_started' || data.type === 'import_progress') {
            setProgress({ total: data.total, processed: data.processed, scanId: data.scanId });
            setIsScanning(true);
            /* Bump refresh signal every 50 items so pages re-fetch during import. */
            if (data.processed - lastBump >= 50) {
              lastBump = data.processed;
              bump();
            }
          }
          if (data.type === 'import_complete' || data.type === 'import_cancelled') {
            setProgress(null);
            setIsScanning(false);
            lastBump = 0;
            /* Small delay to ensure server has saved DB before pages re-fetch. */
            setTimeout(bump, 500);
          }
        } catch { /* ignore parse errors */ }
      };

      es.onerror = () => {
        es.close();
        /* Reconnect after 3 s — also re-syncs state to clear stale progress. */
        reconnectTimer = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      destroyed = true;
      clearTimeout(reconnectTimer);
      es?.close();
    };
  }, [bump, setIsScanning, syncFromServer]);

  const handleCancel = useCallback(async () => {
    if (!progress?.scanId) return;
    try {
      await cancelScan(progress.scanId);
    } catch (err) {
      /* 400 means the scan already finished — not a real error. */
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

/**
 * Layout wrapper rendered by React Router for the root ("/") path.
 * Includes Header and renders child routes into the `<Outlet>` slot.
 */
export default function Root() {
  return (
    <div className="min-h-screen bg-gray-900">
      <Header />
      <ImportProgressBar />
      <main className="pb-16 sm:pb-0">
        <Outlet />
      </main>
    </div>
  );
}
