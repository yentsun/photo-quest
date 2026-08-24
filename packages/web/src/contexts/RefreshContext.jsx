/**
 * @file Refresh signal context — lets SSE events trigger per-page re-fetches.
 *
 * ImportProgressBar increments the signal; per-page hooks include it in their
 * useEffect deps to re-fetch only the data they display.
 */

import { createContext, useContext, useCallback, useState } from 'react';

const RefreshContext = createContext();

export function RefreshProvider({ children }) {
  const [signal, setSignal] = useState(0);
  /* Per-section counts shown in the sidebar badge (Library / Liked / Tags).
     Kept here so any component can update them and the sidebar reflects the
     latest value without a full page refetch. */
  const [libraryCount, setLibraryCount] = useState(null);
  const [likedCount, setLikedCount] = useState(null);
  const [tagCount, setTagCount] = useState(null);

  const bump = useCallback(() => {
    setSignal(s => s + 1);
  }, []);

  return (
    <RefreshContext.Provider value={{ signal, bump, libraryCount, setLibraryCount, likedCount, setLikedCount, tagCount, setTagCount }}>
      {children}
    </RefreshContext.Provider>
  );
}

/**
 * Returns { signal, bump }.
 * - Include `signal` in useEffect deps to re-fetch when data changes.
 * - Call `bump()` to notify all mounted pages to re-fetch.
 */
export function useRefresh() {
  return useContext(RefreshContext);
}
