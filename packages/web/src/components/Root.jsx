/**
 * @file Root layout component.
 *
 * This component acts as the layout shell for every page in the app.  React
 * Router renders it for the "/" path and injects the matched child route via
 * the `<Outlet>` component.
 *
 * Includes the persistent Header navigation and global import progress bar.
 */

import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './layout/index.js';
import { useMedia } from '../hooks/useMedia.js';

/**
 * Global import progress bar that listens to SSE for any active imports.
 * LAW 1.33: import progress must always be visible.
 */
function ImportProgressBar() {
  const [progress, setProgress] = useState(null); // { total, processed }
  const { refresh } = useMedia();

  /* Check for active imports on mount. */
  useEffect(() => {
    fetch('/scans')
      .then(r => r.json())
      .then(scans => {
        const active = scans.find(s => s.status === 'importing' || s.status === 'discovering');
        if (active) {
          setProgress({ total: active.total, processed: active.processed });
        }
      })
      .catch(() => {});
  }, []);

  /* Always listen to SSE for import events. */
  useEffect(() => {
    const es = new EventSource('/jobs/events');

    let lastRefresh = 0;
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'import_started' || data.type === 'import_progress') {
          setProgress({ total: data.total, processed: data.processed });
          /* Refresh data every 50 items so new media appears during import. */
          if (data.processed - lastRefresh >= 50) {
            lastRefresh = data.processed;
            refresh();
          }
        }
        if (data.type === 'import_complete') {
          setProgress(null);
          /* Small delay to ensure server has saved DB before we fetch. */
          setTimeout(refresh, 500);
        }
      } catch { /* ignore */ }
    };

    es.onerror = () => {
      es.close();
    };

    return () => es.close();
  }, []);

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
      <main>
        <Outlet />
      </main>
    </div>
  );
}
