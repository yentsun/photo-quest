import { useCallback } from 'react';
import { useRefresh } from '../contexts/RefreshContext';
import {
  likeMedia as likeMediaApi,
  deleteMedia as deleteMediaApi,
  renameMedia as renameMediaApi,
  updateMediaTags as updateMediaTagsApi,
  scanMedia as scanMediaApi,
  removeFolder as removeFolderApi,
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

  const refreshLibrary = useCallback(async (folders: any[], onProgress?: (msg: string) => void) => {
    let scannedFolders = 0;
    let newFiles = 0;
    for (const folder of [...new Set(folders.map((f: any) => f.path))]) {
      try {
        onProgress?.(`Scanning ${folder.split(/[/\\]/).pop()}...`);
        const result = await scanMediaApi(folder);
        newFiles += result.added || 0;
        scannedFolders++;
      } catch (err) {
        console.error(`Failed to rescan ${folder}:`, err);
      }
    }
    bump();
    return { serverFolders: scannedFolders, clientFolders: 0, newFiles };
  }, [bump]);

  const removeFolder = useCallback(async (folderId: number) => {
    await removeFolderApi(folderId);
    bump();
  }, [bump]);

  const addFolderWithPath = useCallback(async (path: string) => {
    return scanMediaApi(path);
  }, []);

  return { likeMedia, deleteMedia, renameMedia, updateTags, refreshLibrary, removeFolder, addFolderWithPath };
}
