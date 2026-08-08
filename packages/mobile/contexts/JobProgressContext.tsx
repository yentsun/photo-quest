import { createContext, useContext, useCallback, useRef, useState, type ReactNode } from 'react';

interface JobProgressContextValue {
  progress: Map<number, number>;
  update: (mediaId: number, progressSecs: number) => void;
  clear: (mediaId: number) => void;
}

const JobProgressCtx = createContext<JobProgressContextValue | null>(null);

export function JobProgressProvider({ children }: { children: ReactNode }) {
  const mapRef = useRef(new Map<number, number>());
  const [, forceRender] = useState(0);

  const update = useCallback((mediaId: number, progressSecs: number) => {
    mapRef.current.set(mediaId, progressSecs);
    forceRender((n) => n + 1);
  }, []);

  const clear = useCallback((mediaId: number) => {
    mapRef.current.delete(mediaId);
    forceRender((n) => n + 1);
  }, []);

  return (
    <JobProgressCtx.Provider value={{ progress: mapRef.current, update, clear }}>
      {children}
    </JobProgressCtx.Provider>
  );
}

export function useJobProgress() {
  const ctx = useContext(JobProgressCtx);
  if (!ctx) throw new Error('useJobProgress must be used within JobProgressProvider');
  return ctx;
}
