import { createContext, useContext, useState, type ReactNode } from 'react';

const ScanCtx = createContext<{ isScanning: boolean; setIsScanning: (v: boolean) => void } | null>(null);

export function ScanProvider({ children }: { children: ReactNode }) {
  const [isScanning, setIsScanning] = useState(false);
  return <ScanCtx.Provider value={{ isScanning, setIsScanning }}>{children}</ScanCtx.Provider>;
}

export function useScan() {
  const ctx = useContext(ScanCtx);
  if (!ctx) throw new Error('useScan must be used within ScanProvider');
  return ctx;
}
