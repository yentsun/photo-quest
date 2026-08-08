import { createContext, useContext, useCallback, useState, type ReactNode } from 'react';

const RefreshCtx = createContext<{ signal: number; bump: () => void } | null>(null);

export function RefreshProvider({ children }: { children: ReactNode }) {
  const [signal, setSignal] = useState(0);
  const bump = useCallback(() => setSignal((s) => s + 1), []);
  return <RefreshCtx.Provider value={{ signal, bump }}>{children}</RefreshCtx.Provider>;
}

export function useRefresh() {
  const ctx = useContext(RefreshCtx);
  if (!ctx) throw new Error('useRefresh must be used within RefreshProvider');
  return ctx;
}
