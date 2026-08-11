import { createContext, useContext, useState } from 'react';

const ScanContext = createContext();

export function ScanProvider({ children }) {
  const [isScanning, setIsScanning] = useState(false);
  return <ScanContext.Provider value={{ isScanning, setIsScanning }}>{children}</ScanContext.Provider>;
}

export function useScan() { return useContext(ScanContext); }
