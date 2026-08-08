import { useCallback } from 'react';
import { useRefresh } from '../contexts/RefreshContext';
import {
  likeMedia as likeMediaApi,
  deleteMedia as deleteMediaApi,
  renameMedia as renameMediaApi,
  updateMediaTags as updateMediaTagsApi,
} from '../utils/api';

export function useMediaActions() {
  const { bump } = useRefresh();

  const likeMedia = useCallback(async (media: { id: number }) => {
    try {
      await likeMediaApi(media.id);
      bump();
    } catch (err) {
      console.error('Failed to like media:', err);
    }
  }, [bump]);

  const deleteMedia = useCallback(async (mediaId: number) => {
    await deleteMediaApi(mediaId);
    bump();
  }, [bump]);

  const renameMedia = useCallback(async (id: number, title: string) => {
    await renameMediaApi(id, title);
    bump();
  }, [bump]);

  const updateTags = useCallback(async (id: number, tags: string[]) => {
    await updateMediaTagsApi(id, tags);
    bump();
  }, [bump]);

  return { likeMedia, deleteMedia, renameMedia, updateTags };
}
