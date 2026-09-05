import { useEffect, useRef } from 'react';
import { fetchJobs } from '../utils/api.js';
import { resolveApiUrl } from '../config/apiBase.js';
import { useJobProgressUpdater } from '../contexts/JobProgressContext.jsx';

/**
 * Keeps the transcode jobs list and per-media progress map in sync with the
 * server via SSE + periodic /jobs refresh. Rendered once, above the routes.
 *
 * Progress ticks are applied in-place (no /jobs refetch per tick — that would
 * hammer the server while ffmpeg reports progress continuously). The full list
 * is refetched only on state transitions (queued/complete/failed/paused/...).
 */
export default function TranscodeMonitor() {
  const { setJobs, update: updateProgress, clear: clearProgress } = useJobProgressUpdater();
  const jobsRef = useRef([]);

  const refreshJobs = useRef(async () => {
    try {
      const { jobs } = await fetchJobs();
      jobsRef.current = jobs;
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
      es = new EventSource(resolveApiUrl('/jobs/events'));

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
            case 'transcode_progress': {
              updateProgress(data.mediaId, data.progressSecs);
              /* Update the running job's progress in place — no server round-trip. */
              setJobs(jobsRef.current.map(j =>
                j.id === data.jobId ? { ...j, progress: data.progress, status: 'running' } : j
              ));
              break;
            }
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
