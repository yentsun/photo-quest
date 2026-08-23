/**
 * @file Global scan state context.
 *
 * Tracks whether any import scan is currently active so any component
 * (e.g. Dashboard) can disable actions that shouldn't run during a scan.
 * The ImportProgressBar in Root.jsx is the source of truth — it updates
 * this context as SSE events arrive.
 *
 * Also carries a transient status message ("Refreshing library…", "Imported
 * 12 files.") that the global RefreshToaster surfaces as a toast.
 */

import { createContext, useContext, useState, useCallback, useRef } from 'react';

const ScanContext = createContext({ isScanning: false });

export function ScanProvider({ children }) {
  const [isScanning, setIsScanning] = useState(false);
  const [statusMessage, setStatusMessageState] = useState(null);
  const dismissTimer = useRef(null);

  const setStatusMessage = useCallback((msg) => {
    clearTimeout(dismissTimer.current);
    if (!msg) {
      setStatusMessageState(null);
      return;
    }
    setStatusMessageState(msg);
    dismissTimer.current = setTimeout(() => setStatusMessageState(null), 5000);
  }, []);

  return (
    <ScanContext.Provider value={{ isScanning, setIsScanning, statusMessage, setStatusMessage }}>
      {children}
    </ScanContext.Provider>
  );
}

export function useScan() {
  return useContext(ScanContext);
}
