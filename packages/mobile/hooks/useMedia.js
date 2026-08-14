import { useCallback } from 'react';
import { useRefresh } from '../contexts/RefreshContext';
import {
  likeMedia as likeMediaApi,
  deleteMedia as deleteMediaApi,
  scanMedia as scanMediaApi,
  removeFolder as removeFolderApi,
  clearMediaCache,
} from '../services/api';

export function useMediaActions() {
  const { bump } = useRefresh();

  const likeMedia = useCallback(async (media) => {
    try { await likeMediaApi(media.id); bump(); } catch (err) { console.error(err); }
  }, [bump]);

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
    for (const folderPath of [...new Set(folders.map(f => f.path))]) {
      try {
        onProgress?.(`Scanning ${folderPath.split(/[/\\]/).pop()}...`);
        const result = await scanMediaApi(folderPath);
        newFiles += result.added || 0;
      } catch (err) { console.error(err); }
    }
    await clearMediaCache();
    bump();
    return { serverFolders: folders.length, clientFolders: 0, newFiles };
  }, [bump]);

  return { likeMedia, deleteMedia, addFolderWithPath, removeFolder, refreshLibrary };
}
