import { createContext, useContext, useState, useCallback } from 'react';

const FullscreenContext = createContext();

export function FullscreenProvider({ children }) {
  const [fullscreen, setFullscreen] = useState(false);
  const toggle = useCallback(() => setFullscreen(f => !f), []);
  return <FullscreenContext.Provider value={{ fullscreen, setFullscreen, toggle }}>{children}</FullscreenContext.Provider>;
}

export function useFullscreen() {
  return useContext(FullscreenContext);
}

export default FullscreenContext;
