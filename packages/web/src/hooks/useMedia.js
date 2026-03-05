/**
 * @file Hook for fetching and managing media data.
 */

import { useContext, useEffect, useCallback } from 'react';
import GlobalContext from '../globalContext.js';
import { actions, IMAGE_EXTENSIONS, MEDIA_TYPE } from '@photo-quest/shared';
import { fetchMedia, likeMedia as likeMediaApi, scanMedia as scanMediaApi, addMedia as addMediaApi, findFolder, removeFolder as removeFolderApi } from '../utils/api.js';
import { pickFolder as pickFolderFS } from '../services/fileSystem.js';

/**
 * Hook for accessing and managing media data.
 *
 * @returns {{
 *   media: Array,
 *   loading: boolean,
 *   folders: Array,
 *   likedMedia: Array,
 *   refresh: Function,
 *   likeMedia: Function,
 *   scanFolder: Function,
 *   addMediaFromFolder: Function,
 *   getMediaByFolder: Function,
 * }}
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
    // Optimistic update
    dispatch({ type: actions.MEDIA_LIKED, mediaId: media.id });

    try {
      await likeMediaApi(media.id);
    } catch (err) {
      console.error('Failed to like media:', err);
      // Could revert optimistic update here
    }
  }, [dispatch]);

  const scanFolder = useCallback(async (path) => {
    const result = await scanMediaApi(path);
    // Refresh media list after scan
    await refresh();
    return result;
  }, [refresh]);

  /**
   * Add media from a client-side folder scan (File System Access API).
   * Stores metadata on server and updates local state.
   */
  const addMediaFromFolder = useCallback(async (folderId, folderName, files) => {
    // Send to server
    await addMediaApi(folderId, folderName, files);

    // Build local media objects for immediate state update
    const newMedia = files.map((file, index) => {
      const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0] || '';
      const isImage = IMAGE_EXTENSIONS.includes(ext);
      return {
        id: `local-${folderId}-${index}`, // Temporary ID until refresh
        path: `${folderId}:${file.path}`,
        title: file.name.replace(/\.[^.]+$/, ''),
        type: isImage ? MEDIA_TYPE.IMAGE : MEDIA_TYPE.VIDEO,
        folder: folderName,
        likes: 0,
        folderId, // Store for blob URL generation
        relativePath: file.path, // Store for blob URL generation
      };
    });

    // Update local state immediately
    dispatch({ type: actions.MEDIA_ADDED, media: newMedia });

    // Refresh to get proper IDs from server
    await refresh();
  }, [dispatch, refresh]);

  const getMediaByFolder = useCallback((folder) => {
    return state.media.filter(m => m.folder === folder);
  }, [state.media]);

  /**
   * Remove a folder from the library.
   * Records are hidden (not deleted) so likes are preserved if re-added.
   */
  const removeFolder = useCallback(async (folderName) => {
    const result = await removeFolderApi(folderName);
    await refresh();
    return result;
  }, [refresh]);

  /**
   * Pick a folder using native file picker and add to library.
   * Tries server-side scan first (for cross-device access).
   * Returns needsManualPath: true if server can't find it and user should provide path.
   *
   * @returns {Promise<{source: 'server'|'needs-path', added?: number, folderName?: string, files?: Array}>}
   */
  const pickAndAddFolder = useCallback(async () => {
    // Step 1: Pick folder using native file picker
    const { id, name, files } = await pickFolderFS();

    // Step 2: Try to find folder on server (for cross-device access)
    try {
      const result = await findFolder(name);
      if (result.found && result.path) {
        // Server has access - use server-side scan
        console.log(`Server found folder at: ${result.path}`);
        const scanResult = await scanMediaApi(result.path);
        await refresh();
        return { source: 'server', added: scanResult.added };
      }
    } catch (err) {
      console.warn('Server folder lookup failed:', err);
    }

    // Server couldn't find folder - return data for manual path entry
    console.log(`Server couldn't find folder "${name}" - manual path needed for cross-device access`);
    return {
      source: 'needs-path',
      folderName: name,
      folderId: id,
      files,
    };
  }, [refresh]);

  /**
   * Add folder using manual server path (for cross-device access).
   */
  const addFolderWithPath = useCallback(async (manualPath) => {
    const scanResult = await scanMediaApi(manualPath);
    await refresh();
    return { source: 'server', added: scanResult.added };
  }, [refresh]);

  /**
   * Add folder using client-side files (local device only, no cross-device access).
   */
  const addFolderClientSide = useCallback(async (folderId, folderName, files) => {
    await addMediaApi(folderId, folderName, files);

    // Build local media objects for immediate state update
    const newMedia = files.map((file, index) => {
      const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0] || '';
      const isImage = IMAGE_EXTENSIONS.includes(ext);
      return {
        id: `local-${folderId}-${index}`,
        path: `${folderId}:${file.path}`,
        title: file.name.replace(/\.[^.]+$/, ''),
        type: isImage ? MEDIA_TYPE.IMAGE : MEDIA_TYPE.VIDEO,
        folder: folderName,
        likes: 0,
        folderId,
        relativePath: file.path,
      };
    });

    dispatch({ type: actions.MEDIA_ADDED, media: newMedia });
    await refresh();
    return { source: 'client', added: files.length };
  }, [dispatch, refresh]);

  const likedMedia = state.media.filter(m => m.likes > 0);

  // Load media on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    media: state.media,
    loading: state.mediaLoading,
    folders: state.folders,
    likedMedia,
    refresh,
    likeMedia,
    scanFolder,
    addMediaFromFolder,
    getMediaByFolder,
    pickAndAddFolder,
    addFolderWithPath,
    addFolderClientSide,
    removeFolder,
  };
}
