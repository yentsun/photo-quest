/**
 * @file Shared media action hooks (like, delete, scan, remove folder).
 *
 * No auto-fetching — each page fetches its own data via the refresh signal.
 */

import { useCallback } from 'react';
import { useRefresh } from '../contexts/RefreshContext.jsx';
import { useScan } from '../contexts/ScanContext.jsx';
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
  const { bump, setLikedCount } = useRefresh();
  const { abortRef } = useScan();

  const likeMedia = useCallback(async (media) => {
    try {
      const { likedCount } = await likeMediaApi(media.id);
      /* Update the sidebar count directly from the response — no extra fetch. */
      if (likedCount != null) setLikedCount(likedCount);
    } catch (err) {
      console.error('Failed to like media:', err);
    }
  }, [setLikedCount]);

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

    /* A fresh refresh is a fresh intent: clear any abort set by a prior
       cancel (e.g. a previously cancelled add-folder import), otherwise the
       first folder would be silently skipped. */
    abortRef.current = false;

    for (const folderPath of folderPaths) {
      /* If the user pressed Stop, stop firing new folder scans immediately. */
      if (abortRef.current) break;
      try {
        onProgress?.(`Scanning ${folderPath.split(/[/\\]/).pop()}...`);
        const result = await scanMediaApi(folderPath);
        newFiles += result.total || 0;
        scannedFolders++;
      } catch (err) {
        console.error(`Failed to rescan ${folderPath}:`, err);
      }
    }

    abortRef.current = false;
    bump();
    return { serverFolders: scannedFolders, clientFolders: 0, newFiles };
  }, [bump, abortRef]);

  return { likeMedia, deleteMedia, addFolderWithPath, removeFolder, refreshLibrary };
}
