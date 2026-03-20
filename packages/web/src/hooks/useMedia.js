/**
 * @file Shared media action hooks (like, delete, scan, remove folder).
 *
 * No auto-fetching — each page fetches its own data via the refresh signal.
 */

import { useCallback } from 'react';
import { useRefresh } from '../contexts/RefreshContext.jsx';
import {
  likeMedia as likeMediaApi,
  deleteMedia as deleteMediaApi,
  scanMedia as scanMediaApi,
  removeFolder as removeFolderApi,
} from '../utils/api.js';

/**
 * Hook for media mutation actions. Does NOT fetch or store media data.
 * Pages fetch their own data; this hook provides shared write operations.
 */
export function useMediaActions() {
  const { bump } = useRefresh();

  const likeMedia = useCallback(async (media) => {
    try {
      await likeMediaApi(media.id);
      bump();
    } catch (err) {
      console.error('Failed to like media:', err);
    }
  }, [bump]);

  const deleteMedia = useCallback(async (mediaId) => {
    await deleteMediaApi(mediaId);
    bump();
  }, [bump]);

  const addFolderWithPath = useCallback(async (folderPath) => {
    return scanMediaApi(folderPath);
  }, []);

  const removeFolder = useCallback(async (folderId) => {
    const result = await removeFolderApi(folderId);
    bump();
    return result;
  }, [bump]);

  const refreshLibrary = useCallback(async (folders, onProgress) => {
    let scannedFolders = 0;
    let newFiles = 0;

    const folderPaths = [...new Set(folders.map(f => f.path))];

    for (const folderPath of folderPaths) {
      try {
        onProgress?.(`Scanning ${folderPath.split(/[/\\]/).pop()}...`);
        const result = await scanMediaApi(folderPath);
        newFiles += result.added || 0;
        scannedFolders++;
      } catch (err) {
        console.error(`Failed to rescan ${folderPath}:`, err);
      }
    }

    bump();
    return { serverFolders: scannedFolders, clientFolders: 0, newFiles };
  }, [bump]);

  return { likeMedia, deleteMedia, addFolderWithPath, removeFolder, refreshLibrary };
}
