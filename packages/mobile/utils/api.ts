import { apiRoutes } from '@photo-quest/shared';
import { getServerUrl } from './config';

async function apiFetch(path: string, init?: RequestInit) {
  const base = getServerUrl();
  const url = new URL(path, base);
  const resp = await fetch(url.toString(), init);
  if (!resp.ok) throw new Error(`API ${resp.status}: ${resp.statusText}`);
  return resp.json();
}

export async function fetchMedia(params?: Record<string, string | number | boolean | undefined>) {
  const url = new URL(apiRoutes.media, getServerUrl());
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v != null) url.searchParams.set(k, String(v));
    }
  }
  const resp = await fetch(url.toString());
  if (!resp.ok) throw new Error('Failed to fetch media');
  return resp.json();
}

export async function fetchMediaById(id: number) {
  const url = `${getServerUrl()}/media/${id}`;
  const resp = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!resp.ok) throw new Error('Failed to fetch media');
  return resp.json();
}

export async function fetchFolders() {
  return apiFetch(apiRoutes.folders);
}

export async function fetchFoldersForParent(parentId: number) {
  const resp = await fetch(`${getServerUrl()}/folders?parent=${parentId}`);
  if (!resp.ok) throw new Error('Failed to fetch folders');
  return resp.json();
}

export async function fetchTags() {
  return apiFetch(apiRoutes.tags);
}

export async function fetchNetworkInfo(): Promise<{ ip: string | null }> {
  return apiFetch(apiRoutes.network);
}

export async function scanMedia(path: string) {
  const resp = await fetch(`${getServerUrl()}/media/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  if (!resp.ok) throw new Error('Failed to scan directory');
  return resp.json();
}

export async function removeFolder(folderId: number) {
  const resp = await fetch(`${getServerUrl()}/media/folder/${folderId}`, { method: 'DELETE' });
  if (!resp.ok) throw new Error('Failed to remove folder');
  return resp.json();
}

export async function likeMedia(id: number) {
  return apiFetch(apiRoutes.mediaLike.replace(':id', String(id)), { method: 'PATCH' });
}

export async function deleteMedia(id: number) {
  return apiFetch(apiRoutes.mediaById.replace(':id', String(id)), { method: 'DELETE' });
}

export async function renameMedia(id: number, title: string) {
  const url = `${getServerUrl()}/media/${id}/title`;
  const resp = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!resp.ok) throw new Error('Failed to rename');
  return resp.json();
}

export async function updateMediaTags(id: number, tags: string[]) {
  const url = `${getServerUrl()}/media/${id}/tags`;
  const resp = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags }),
  });
  if (!resp.ok) throw new Error('Failed to update tags');
  return resp.json();
}

export function getStreamUrl(id: number) {
  return `${getServerUrl()}/stream/${id}`;
}

export function getImageUrl(id: number) {
  return `${getServerUrl()}/image/${id}`;
}

export function getThumbUrl(id: number, time?: number) {
  const base = `${getServerUrl()}/thumb/${id}`;
  return time != null ? `${base}?time=${time}` : base;
}

export { getStreamUrl as getMediaUrl };
