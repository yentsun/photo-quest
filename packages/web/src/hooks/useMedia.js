/**
 * @file Hook for fetching and managing media data.
 */

import { useContext, useEffect, useCallback } from 'react';
import GlobalContext from '../globalContext.js';
import { actions } from '@photo-quest/shared';
import { fetchMedia, likeMedia as likeMediaApi, scanMedia as scanMediaApi, removeFolder as removeFolderApi } from '../utils/api.js';

/**
 * Hook for accessing and managing media data.
 */
export function useMedia() {
  const { state, dispatch } = useContext(GlobalContext);

  const refresh = useCallback(async () => {
    try {
      const media = await fetchMedia();
      dispatch({ type: actions.MEDIA_LOADED, media });
    } catch (err) {
      console.error('Failed to fetch media:', err);
    }
  }, [dispatch]);

  const likeMedia = useCallback(async (media) => {
    dispatch({ type: actions.MEDIA_LIKED, mediaId: media.id });

    try {
      await likeMediaApi(media.id);
    } catch (err) {
      console.error('Failed to like media:', err);
    }
  }, [dispatch]);

  /**
   * Add folder using a server path.
   * Returns { scanId, total } — caller should listen to SSE for progress.
   */
  const addFolderWithPath = useCallback(async (folderPath) => {
    const result = await scanMediaApi(folderPath);
    return result;
  }, []);

  /**
   * Remove a folder from the library.
   * Records are hidden (not deleted) so likes are preserved if re-added.
   */
  const removeFolder = useCallback(async (folderName) => {
    const result = await removeFolderApi(folderName);
    await refresh();
    return result;
  }, [refresh]);

  const likedMedia = state.media.filter(m => m.likes > 0);

  const getMediaByFolder = useCallback((folder) => {
    return state.media.filter(m => m.folder === folder);
  }, [state.media]);

  /**
   * Refresh library by rescanning all known server folders for new files.
   */
  const refreshLibrary = useCallback(async (onProgress) => {
    let serverFolders = 0;
    let newFiles = 0;

    const folderPaths = [...new Set(
      state.media
        .filter(m => m.folder)
        .map(m => m.folder)
    )];

    for (const folderPath of folderPaths) {
      try {
        onProgress?.(`Scanning ${folderPath.split(/[/\\]/).pop()}...`);
        const result = await scanMediaApi(folderPath);
        newFiles += result.added || 0;
        serverFolders++;
      } catch (err) {
        console.error(`Failed to rescan ${folderPath}:`, err);
      }
    }

    await refresh();

    return { serverFolders, clientFolders: 0, newFiles };
  }, [state.media, refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    media: state.media,
    loading: state.mediaLoading,
    folders: state.folders,
    likedMedia,
    refresh,
    refreshLibrary,
    likeMedia,
    getMediaByFolder,
    addFolderWithPath,
    removeFolder,
  };
}
