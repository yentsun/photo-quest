import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { fetchMedia } from '../services/api';
import { usePlaylist } from '../contexts/PlaylistContext';

export function useShuffle() {
  const router = useRouter();
  const { set } = usePlaylist();

  return useCallback(async (opts = {}) => {
    try {
      const { items } = await fetchMedia({ ...opts, random: true, limit: 10000 });
      if (!items?.length) return;
      set(items.map(i => i.id), 0);
      router.push(`/media/${items[0].id}`);
    } catch (err) {
      console.error('Shuffle failed:', err);
    }
  }, [router, set]);
}
