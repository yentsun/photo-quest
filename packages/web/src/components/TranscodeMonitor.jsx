import { useEffect, useRef } from 'react';
import { fetchJobs } from '../utils/api.js';
import { useJobProgressUpdater } from '../contexts/JobProgressContext.jsx';

/**
 * Keeps the transcode jobs list and per-media progress map in sync with the
 * server via SSE + periodic /jobs refresh. Rendered once, above the routes.
 */
export default function TranscodeMonitor() {
  const { setJobs, update: updateProgress, clear: clearProgress } = useJobProgressUpdater();

  const refreshJobs = useRef(async () => {
    try {
      const { jobs } = await fetchJobs();
      setJobs(jobs);
    } catch { /* server may be down; SSE will reconnect */ }
  });

  useEffect(() => {
    refreshJobs.current();

    let es = null;
    let reconnectTimer = null;
    let destroyed = false;

    const connect = () => {
      if (destroyed) return;
      es = new EventSource('/jobs/events');

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          switch (data.type) {
            case 'transcode_queued':
            case 'transcode_complete':
            case 'transcode_failed':
            case 'transcode_paused':
            case 'transcode_resumed':
            case 'transcode_cancelled':
              refreshJobs.current();
              break;
            case 'transcode_progress':
              updateProgress(data.mediaId, data.progressSecs);
              refreshJobs.current();
              break;
            default:
              break;
          }
        } catch { /* ignore parse errors */ }
      };

      es.onerror = () => { es.close(); reconnectTimer = setTimeout(connect, 3000); };
    };

    connect();
    return () => { destroyed = true; clearTimeout(reconnectTimer); es?.close(); };
  }, [setJobs, updateProgress]);

  return null;
}
