import { createContext, useContext, useState, useCallback } from 'react';

const ProgressMapContext = createContext(new Map());
const ProgressUpdaterContext = createContext({ update: () => {}, clear: () => {} });

export function JobProgressProvider({ children }) {
  const [map, setMap] = useState(() => new Map());

  const update = useCallback((mediaId, secs) => {
    setMap(m => new Map(m).set(mediaId, secs));
  }, []);

  const clear = useCallback((mediaId) => {
    setMap(m => { const n = new Map(m); n.delete(mediaId); return n; });
  }, []);

  return (
    <ProgressUpdaterContext.Provider value={{ update, clear }}>
      <ProgressMapContext.Provider value={map}>
        {children}
      </ProgressMapContext.Provider>
    </ProgressUpdaterContext.Provider>
  );
}

export function useJobProgress(mediaId) {
  return useContext(ProgressMapContext).get(mediaId) ?? null;
}

export function useJobProgressUpdater() {
  return useContext(ProgressUpdaterContext);
}
