import { createContext, useContext, useState, useCallback } from 'react';

const JobsContext = createContext([]);
const ProgressMapContext = createContext(new Map());
const JobsUpdaterContext = createContext({ setJobs: () => {} });

export function JobProgressProvider({ children }) {
  const [jobs, setJobs] = useState([]);
  const [progressMap, setProgressMap] = useState(() => new Map());

  /* Derive the per-media progress map (seconds for card overlays). The
     server now reports 0-100 progress; we keep the map keyed by mediaId
     for the legacy card overlay contract. */
  const update = useCallback((mediaId, progress) => {
    setProgressMap(m => new Map(m).set(mediaId, progress));
  }, []);

  const clear = useCallback((mediaId) => {
    setProgressMap(m => { const n = new Map(m); n.delete(mediaId); return n; });
  }, []);

  return (
    <JobsUpdaterContext.Provider value={{ setJobs, update, clear }}>
      <JobsContext.Provider value={jobs}>
        <ProgressMapContext.Provider value={progressMap}>
          {children}
        </ProgressMapContext.Provider>
      </JobsContext.Provider>
    </JobsUpdaterContext.Provider>
  );
}

/** The full list of transcode jobs (running, queued, paused, etc.). */
export function useJobs() {
  return useContext(JobsContext);
}

/** Per-media transcode progress (0-100), used by card overlays. */
export function useJobProgress(mediaId) {
  return useContext(ProgressMapContext).get(mediaId) ?? null;
}

export function useJobProgressUpdater() {
  return useContext(JobsUpdaterContext);
}
