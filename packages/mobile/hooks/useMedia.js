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
  const { bump, setLikedCount } = useRefresh();

  const likeMedia = useCallback(async (media) => {
    try {
      const { likedCount } = await likeMediaApi(media.id);
      if (likedCount != null) setLikedCount(likedCount);
    } catch (err) { console.error(err); }
  }, [setLikedCount]);

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
    const totalFolders = folderPaths.length;
    for (let i = 0; i < folderPaths.length; i++) {
      const folderPath = folderPaths[i];
      const name = folderPath.split(/[/\\]/).pop() || folderPath;
      try {
        onProgress?.(`Scanning ${name}…`, { value: i, max: totalFolders });
        const result = await scanMediaApi(folderPath);
        newFiles += result.total || 0;
        if (result.scanId) {
          try { await waitForScan(result.scanId); } catch {}
        }
      } catch (err) { console.error(err); }
      onProgress?.(`Scanned ${name}`, { value: i + 1, max: totalFolders });
    }
    await clearMediaCache();
    bump();
    return { serverFolders: totalFolders, clientFolders: 0, newFiles };
  }, [bump]);

  return { likeMedia, deleteMedia, addFolderWithPath, removeFolder, refreshLibrary };
}
