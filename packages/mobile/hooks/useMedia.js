import { useCallback } from 'react';
import { useRefresh } from '../contexts/RefreshContext';
import {
  likeMedia as likeMediaApi,
  deleteMedia as deleteMediaApi,
  scanMedia as scanMediaApi,
  removeFolder as removeFolderApi,
  waitForScan,
  clearMediaCache,
} from '../services/api';

export function useMediaActions() {
  const { bump } = useRefresh();

  const likeMedia = useCallback(async (media) => {
    try { await likeMediaApi(media.id); } catch (err) { console.error(err); }
  }, []);

  const deleteMedia = useCallback(async (mediaId) => {
    await deleteMediaApi(mediaId); bump();
  }, [bump]);

  const addFolderWithPath = useCallback(async (folderPath) => {
    return scanMediaApi(folderPath);
  }, []);

  const removeFolder = useCallback(async (folderId) => {
    const result = await removeFolderApi(folderId); bump(); return result;
  }, [bump]);

  const refreshLibrary = useCallback(async (folders, onProgress) => {
    let newFiles = 0;
    const folderPaths = [...new Set(folders.map(f => f.path))];
    for (const folderPath of folderPaths) {
      try {
        onProgress?.(`Scanning ${folderPath.split(/[/\\]/).pop()}...`);
        const result = await scanMediaApi(folderPath);
        newFiles += result.total || 0;
        if (result.scanId) {
          try { await waitForScan(result.scanId); } catch {}
        }
      } catch (err) { console.error(err); }
    }
    await clearMediaCache();
    bump();
    return { serverFolders: folderPaths.length, clientFolders: 0, newFiles };
  }, [bump]);

  return { likeMedia, deleteMedia, addFolderWithPath, removeFolder, refreshLibrary };
}
