import { createContext, useContext, useState, useCallback } from 'react';

const PlaylistContext = createContext();

export function PlaylistProvider({ children }) {
  const [playlist, setPlaylist] = useState({ ids: [], index: 0 });

  const set = useCallback((ids, index) => {
    setPlaylist({ ids, index });
  }, []);

  const goNext = useCallback(() => {
    setPlaylist(p => {
      if (p.ids.length <= 1) return p;
      return { ...p, index: (p.index + 1) % p.ids.length };
    });
  }, []);

  const goPrev = useCallback(() => {
    setPlaylist(p => {
      if (p.ids.length <= 1) return p;
      return { ...p, index: (p.index - 1 + p.ids.length) % p.ids.length };
    });
  }, []);

  const currentId = playlist.ids[playlist.index] || null;

  return (
    <PlaylistContext.Provider value={{ playlist, currentId, set, goNext, goPrev }}>
      {children}
    </PlaylistContext.Provider>
  );
}

export function usePlaylist() {
  return useContext(PlaylistContext);
}

export default PlaylistContext;
