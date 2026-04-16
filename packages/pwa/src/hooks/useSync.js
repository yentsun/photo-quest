import { useEffect, useRef, useState } from 'react';
import { startSync } from '../db/sync.js';

/**
 * Spawn a sync worker whenever `serverUrl` is set and we're not paused.
 *
 * `toggle()` pauses an in-flight sync (terminates the worker) or resumes
 * it (spawns a new one that re-fetches). Pause is reversible — no state
 * is lost on the client, the server snapshot is just replaced again.
 *
 * The pill reflects server traffic only — local IDB mutations don't
 * flip it. Queued mutations show up here when the worker actually
 * pushes them (tick drain triggers 'change'/'done' over SSE).
 *
 * phases: 'idle' | 'syncing' | 'done' | 'error' | 'paused'
 */
export function useSync(serverUrl) {
  const [status, setStatus] = useState({ phase: 'idle', progress: {}, error: null });
  const [paused, setPaused] = useState(false);
  const stopRef = useRef(null);

  useEffect(() => {
    if (!serverUrl) { setStatus({ phase: 'idle', progress: {}, error: null }); return; }
    if (paused)     { setStatus(s => ({ ...s, phase: 'paused' })); return; }

    setStatus({ phase: 'syncing', progress: {}, error: null });

    stopRef.current = startSync(serverUrl, (msg) => {
      setStatus(prev => {
        if (msg.type === 'progress') return {
          ...prev,
          progress: { ...prev.progress, [msg.store]: { count: msg.count, total: msg.total } },
        };
        if (msg.type === 'change') return { ...prev, phase: 'syncing' };
        if (msg.type === 'done')   return { ...prev, phase: 'done' };
        if (msg.type === 'error')  return { ...prev, phase: 'error', error: msg.message };
        return prev;
      });
    });

    return () => { stopRef.current?.(); stopRef.current = null; };
  }, [serverUrl, paused]);

  const toggle = () => {
    if (status.phase === 'syncing') setPaused(true);
    else                            setPaused(false);
  };

  return { ...status, toggle };
}
