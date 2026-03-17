/**
 * @file Hook for fetching and managing media data.
 */

import { useContext, useEffect, useCallback, useMemo } from 'react';
import GlobalContext from '../globalContext.js';
import { actions } from '@photo-quest/shared';
import { fetchMedia, fetchFolders, likeMedia as likeMediaApi, deleteMedia as deleteMediaApi, scanMedia as scanMediaApi, removeFolder as removeFolderApi, MEDIA_PAGE_SIZE } from '../utils/api.js';

/**
 * Hook for accessing and managing media data.
 */
export function useMedia() {
  const { state, dispatch } = useContext(GlobalContext);

  const refresh = useCallback(async () => {
    try {
      const [firstPage, folders] = await Promise.all([
        fetchMedia({ limit: MEDIA_PAGE_SIZE, offset: 0 }),
        fetchFolders(),
      ]);
      dispatch({ type: actions.MEDIA_LOADED, media: firstPage.items, total: firstPage.total });
      dispatch({ type: actions.FOLDERS_LOADED, folders });

      // Load remaining pages in the background
      let offset = MEDIA_PAGE_SIZE;
      while (offset < firstPage.total) {
        const page = await fetchMedia({ limit: MEDIA_PAGE_SIZE, offset });
        if (page.items.length === 0) break;
        dispatch({ type: actions.MEDIA_PAGE_LOADED, media: page.items });
        offset += MEDIA_PAGE_SIZE;
      }
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
   * Remove a folder from the library by ID.
   * Records are hidden (not deleted) so likes are preserved if re-added.
   */
  const removeFolder = useCallback(async (folderId) => {
    const result = await removeFolderApi(folderId);
    await refresh();
    return result;
  }, [refresh]);

  /** Delete a media item from library and disk (LAW 1.34). */
  const deleteMedia = useCallback(async (mediaId) => {
    await deleteMediaApi(mediaId);
    await refresh();
  }, [refresh]);

  const likedMedia = useMemo(() => state.media.filter(m => m.likes > 0), [state.media]);

  /** Get media directly in a specific folder (exact match). */
  const getMediaByFolder = useCallback((folder) => {
    return state.media.filter(m => m.folder === folder);
  }, [state.media]);

  /** Get all media in a folder's subtree (folder + all descendants). */
  const getMediaInSubtree = useCallback((folderPath) => {
    const normalized = folderPath.replace(/\\/g, '/');
    return state.media.filter(m => {
      const mFolder = (m.folder || '').replace(/\\/g, '/');
      return mFolder === normalized || mFolder.startsWith(normalized + '/');
    });
  }, [state.media]);

  /** Get root folders (no parent in the folders table). */
  const rootFolders = useMemo(() => {
    return state.folders.filter(f => f.parentId === null);
  }, [state.folders]);

  /** Get direct subfolders of a folder. */
  const getSubfolders = useCallback((folderId) => {
    return state.folders.filter(f => f.parentId === folderId);
  }, [state.folders]);

  /** Get a folder by ID. */
  const getFolderById = useCallback((id) => {
    return state.folders.find(f => f.id === id);
  }, [state.folders]);

  /** Get breadcrumb chain from root to the given folder. */
  const getBreadcrumbs = useCallback((folderId) => {
    const crumbs = [];
    let current = state.folders.find(f => f.id === folderId);
    while (current) {
      crumbs.unshift(current);
      current = current.parentId
        ? state.folders.find(f => f.id === current.parentId)
        : null;
    }
    return crumbs;
  }, [state.folders]);

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
    rootFolders,
    likedMedia,
    refresh,
    refreshLibrary,
    likeMedia,
    deleteMedia,
    getMediaByFolder,
    getMediaInSubtree,
    getSubfolders,
    getFolderById,
    getBreadcrumbs,
    addFolderWithPath,
    removeFolder,
  };
}
