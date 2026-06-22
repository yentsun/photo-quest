/**
 * @file Global scan state context.
 *
 * Tracks whether any import scan is currently active so any component
 * (e.g. Dashboard) can disable actions that shouldn't run during a scan.
 * The ImportProgressBar in Root.jsx is the source of truth — it updates
 * this context as SSE events arrive.
 */

import { createContext, useContext, useState } from 'react';

const ScanContext = createContext({ isScanning: false });

export function ScanProvider({ children }) {
  const [isScanning, setIsScanning] = useState(false);

  return (
    <ScanContext.Provider value={{ isScanning, setIsScanning }}>
      {children}
    </ScanContext.Provider>
  );
}

export function useScan() {
  return useContext(ScanContext);
}
