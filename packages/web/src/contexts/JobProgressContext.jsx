import { createContext, useContext } from 'react';

/** Map<mediaId, progressSeconds> — populated by Root's SSE listener. */
export const JobProgressContext = createContext(new Map());

/** Returns the current transcode progress (seconds) for a media item, or null. */
export function useJobProgress(mediaId) {
  return useContext(JobProgressContext).get(mediaId) ?? null;
}
