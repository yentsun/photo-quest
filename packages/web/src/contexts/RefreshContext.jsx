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

  const bump = useCallback(() => {
    setSignal(s => s + 1);
  }, []);

  return (
    <RefreshContext.Provider value={{ signal, bump }}>
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
