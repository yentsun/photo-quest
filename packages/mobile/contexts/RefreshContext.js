import { createContext, useContext, useCallback, useState } from 'react';

const RefreshContext = createContext();

export function RefreshProvider({ children }) {
  const [signal, setSignal] = useState(0);
  const bump = useCallback(() => setSignal(s => s + 1), []);
  return <RefreshContext.Provider value={{ signal, bump }}>{children}</RefreshContext.Provider>;
}

export function useRefresh() { return useContext(RefreshContext); }
