import { useEffect, useCallback, useState, useRef, useMemo, useContext } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useMediaActions } from '../../hooks/useMedia.js';
import { useRefresh } from '../../contexts/RefreshContext.jsx';
import { useSlideshow } from '../../contexts/SlideshowContext.jsx';
import GlobalContext from '../../globalContext.js';
import { actions, MEDIA_TYPE, MEDIA_STATUS } from '@photo-quest/shared';
import { ImageViewer, MediaPlayer, LikeButton, DuplicateThumb } from '../media/index.js';
import { EmptyState } from '../layout/index.js';
import { Button, Icon, IconButton, Loader, Modal, ProgressBar } from '../ui/index.js';
import { getMediaUrl, getImageUrl, downloadMedia, fetchMediaById, fetchMedia, fetchTags, fetchFolders, likeMedia as likeMediaApi, renameMedia, updateMediaTags, setFolderThumbnail, setVideoThumbnail, getLastMediaItem, getLastFolders, fetchMediaDuplicates, mergeDuplicates as mergeDuplicatesApi, repairFailed } from '../../utils/api.js';
import { useJobProgress } from '../../contexts/JobProgressContext.jsx';
import { idbGetMediaById, idbGetMedia } from '../../services/idb.js';
import { getPageCache } from '../../utils/pageCache.js';
import { isVideoControlPress } from '../../utils/mediaMagnifier.js';

const FETCH_LIMIT = 10000;

function byName(a, b) {
  return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });
}

function applySort(items, sort = 'filename') {
  let result;
  if (sort === 'filename') {
    result = items.slice().sort(byName);
  } else {
    result = items.slice().sort((a, b) => {
      const aDate = a.date_taken || a.created_at || '';
      const bDate = b.date_taken || b.created_at || '';
      const dateCompare = bDate.localeCompare(aDate);
      if (dateCompare !== 0) return dateCompare;
      const pathA = a.path || '', pathB = b.path || '';
      return pathB.localeCompare(pathA);
    });
  }
  const coverIdx = result.findIndex(m => /cover/i.test(m.title));
  if (coverIdx > 0) result.unshift(result.splice(coverIdx, 1)[0]);
  return result;
}

function safeTags(tags) {
  if (Array.isArray(tags)) return tags;
  if (typeof tags === 'string') {
    try { return JSON.parse(tags); } catch { return []; }
  }
  return [];
}

export default function MediaPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const sort = location.state?.sort || 'filename';
  const navContext = location.state?.context;
  const { deleteMedia } = useMediaActions();
  const { signal, bump, setTagCount, setLikedCount } = useRefresh();
  const { dispatch } = useContext(GlobalContext);
  const slideshow = useSlideshow();
  const { removeItem: removeSlideshowItem } = slideshow;
  const [showInfo, setShowInfo] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const titleInputRef = useRef(null);
  const playerRef = useRef(null);
  const [fileStatus, setFileStatus] = useState(null);
  const [fixing, setFixing] = useState(false);
  /* Set when the <video> element fails to play a "ready" file (e.g. a corrupt
     transcoded output) so the Fix action can offer a forced re-transcode. */
  const [playbackError, setPlaybackError] = useState(false);
  const [addingTag, setAddingTag] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const [allTags, setAllTags] = useState([]);
  const [suggestionIndex, setSuggestionIndex] = useState(-1);
  const tagInputRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [duplicates, setDuplicates] = useState({ ids: [], count: 0, items: [] });
  const [showMerge, setShowMerge] = useState(false);
  const viewerRef = useRef(null);
  const mediaViewportRef = useRef(null);
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  /* Folder chains for slideshow items, which come from a list endpoint that
     does not embed `folder_chain`. Keyed by folder path so each folder is
     fetched at most once per session. */
  const folderChainCacheRef = useRef(new Map());

  const inSlideshow = slideshow.active;

  const [item, setItem] = useState(() => {
    if (inSlideshow) return slideshow.current;
    return getLastMediaItem(Number(id)) || null;
  });
  const [folderMedia, setFolderMedia] = useState(() => {
    if (inSlideshow) return [];
    const cachedItem = getLastMediaItem(Number(id));
    if (!cachedItem?.folder) return [];
    const cachedFolders = getLastFolders();
    if (!cachedFolders) return [];
    const f = cachedFolders.find(cf => cf.path === cachedItem.folder);
    if (!f) return [];
      return getPageCache(`folder:${f.id}:${sort}`)?.data?.directMedia
        ?? getPageCache(`folder:${f.id}:filename`)?.data?.directMedia
        ?? [];
  });
  const [likedNavList, setLikedNavList] = useState(() =>
    navContext === 'liked' ? (getPageCache('liked')?.data?.likedMedia ?? []) : []
  );
  const [folders, setFolders] = useState(() => getLastFolders() || []);
  const [folder, setFolder] = useState(() => {
    const cachedItem = inSlideshow ? slideshow.current : getLastMediaItem(Number(id));
    const cachedFolders = getLastFolders();
    if (!cachedItem?.folder || !cachedFolders) return null;
    return cachedFolders.find(f => f.path === cachedItem.folder) || null;
  });
  const [loading, setLoading] = useState(!inSlideshow && !getLastMediaItem(Number(id)));
  const [loadingMessage, setLoadingMessage] = useState('Fetching media item…');
  const progressSecs = useJobProgress(item?.id);

  useEffect(() => {
    if (!inSlideshow) return;
    const currentItem = slideshow.current;
    setItem(currentItem);
    setLoading(false);
    if (currentItem?.folder_chain) {
      const chain = currentItem.folder_chain;
      setFolder(chain[chain.length - 1] || null);
    } else {
      setFolder(null);
    }
  }, [inSlideshow, slideshow.current]); // eslint-disable-line react-hooks/exhaustive-deps

  /* In a slideshow, sequence items come from the list endpoint without
     `folder_chain`, and up/down navigation can show a folder sibling that is
     not the slideshow current. Fetch the chain for whatever item is actually
     on screen (not `slideshow.current`) so breadcrumbs always render. Cached
     per folder so each folder is fetched at most once per session. */
  useEffect(() => {
    if (!inSlideshow || !item?.folder || item.folder_chain) return;
    const folderPath = item.folder;
    const itemId = item.id;

    const cached = folderChainCacheRef.current.get(folderPath);
    if (cached) {
      setItem(prev => (prev?.id === itemId ? { ...prev, folder_chain: cached } : prev));
      return;
    }

    let cancelled = false;
    fetchMediaById(itemId, { skipCache: true })
      .then(fresh => {
        if (cancelled || !fresh?.folder_chain) return;
        folderChainCacheRef.current.set(folderPath, fresh.folder_chain);
        setItem(prev => (prev?.id === itemId ? { ...prev, folder_chain: fresh.folder_chain } : prev));
      })
      .catch(err => console.error('Failed to load media breadcrumbs:', err));
    return () => { cancelled = true; };
  }, [inSlideshow, item?.id, item?.folder, item?.folder_chain]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Full folder list, used to derive breadcrumbs synchronously. Loaded by the
     dashboard normally; fetch it here too so a direct media URL still gets
     breadcrumbs without waiting for anything else. */
  useEffect(() => {
    if (folders.length > 0) return;
    let cancelled = false;
    fetchFolders()
      .then(list => { if (!cancelled && Array.isArray(list)) setFolders(list); })
      .catch(err => console.error('Failed to load folders:', err));
    return () => { cancelled = true; };
  }, [folders.length]);

  useEffect(() => {
    if (inSlideshow) return;
    let cancelled = false;
    const mediaId = Number(id);
    const load = async () => {
      try {
        const syncHit = getLastMediaItem(mediaId);
        if (syncHit) {
          if (!cancelled) { setItem(syncHit); setLoading(false); }
        } else {
          if (!cancelled) setLoading(true);
          const cachedItem = await idbGetMediaById(mediaId);
          if (!cancelled && cachedItem) { setItem(cachedItem); setLoading(false); }
        }
        setLoadingMessage('Fetching media item…');
        /* Authoritative fetch: returns null when the record no longer exists, so
           a stale IndexedDB copy is dropped instead of being shown. On a network
           error it still falls back to the cached item. */
        const mediaItem = await fetchMediaById(mediaId, { skipCache: true });
        if (cancelled) return;
        if (!mediaItem) { setItem(null); setLoading(false); return; }
        setItem(mediaItem);
        setLoading(false);

        const freshItem = mediaItem;

        if (freshItem.folder_chain) {
          const chain = freshItem.folder_chain;
          setFolder(chain[chain.length - 1] || null);
          const { items: cachedSiblings } = await idbGetMedia({ folder: freshItem.folder, sort });
          if (!cancelled && cachedSiblings.length > 0) setFolderMedia(applySort(cachedSiblings, sort));
        }
      } catch (err) { console.error('Failed to load media:', err); if (!cancelled) setItem(null); }
      finally { if (!cancelled) setLoading(false); }
    };
    load();
    return () => { cancelled = true; };
  }, [id, inSlideshow]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (inSlideshow || navContext !== 'liked') return;
    let cancelled = false;
    fetchMedia({ liked: true, limit: FETCH_LIMIT })
      .then(({ items }) => { if (!cancelled) setLikedNavList(items); })
      .catch(err => console.error('Failed to load liked nav list:', err));
    return () => { cancelled = true; };
  }, [inSlideshow, navContext]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Surface a merge action only when the item on screen shares its content hash
     with other visible copies. Runs during a slideshow too (Shuffle is a
     slideshow session); `handleMerge` drops the merged copies from the
     slideshow queue so navigation never lands on a deleted file. */
  useEffect(() => {
    const mediaId = Number(id);
    if (!Number.isInteger(mediaId)) return;
    let cancelled = false;
    fetchMediaDuplicates(mediaId)
      .then(result => { if (!cancelled) setDuplicates({ ids: result.ids ?? [], count: result.count ?? 0, items: result.items ?? [] }); })
      .catch(err => {
        if (cancelled) return;
        console.error('Failed to check duplicates:', err);
        setDuplicates({ ids: [], count: 0, items: [] });
      });
    return () => { cancelled = true; };
  }, [id, inSlideshow, signal]);

  const TERMINAL = [MEDIA_STATUS.READY, MEDIA_STATUS.ERROR];
  useEffect(() => {
    if (!item || item.type !== MEDIA_TYPE.VIDEO || TERMINAL.includes(item.status)) return;
    const interval = setInterval(async () => {
      try { const fresh = await fetchMediaById(Number(id)); setItem(fresh); } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [id, item?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const isLikedNav = navContext === 'liked' && !inSlideshow;
  const navItems = inSlideshow ? slideshow.items : isLikedNav ? likedNavList : folderMedia;
  /* In a slideshow the index is authoritative slideshow state — after a reload
     the URL may briefly point at a stale id, so deriving it from the URL would
     flash a wrong counter/nav state before the URL is corrected. */
  const currentIndex = inSlideshow ? slideshow.currentIndex : navItems.findIndex(m => m.id === Number(id));
  const hasPrev = inSlideshow ? slideshow.history.length > 0 : currentIndex > 0;
  const hasNext = inSlideshow ? navItems.length > 1 : currentIndex < navItems.length - 1;

  /* The item we're on was deleted (e.g. on another device): skip to its next
     neighbour instead of showing "Media not found". Only when the id is part of
     the sequence being navigated, so a bad URL still shows the not-found page. */
  useEffect(() => {
    if (loading || item) return;
    const missingId = Number(id);
    const idx = navItems.findIndex(m => m.id === missingId);
    if (idx === -1) return;
    const fallback = navItems[idx + 1] || navItems[idx - 1];
    setFolderMedia(list => list.filter(m => m.id !== missingId));
    setLikedNavList(list => list.filter(m => m.id !== missingId));
    if (inSlideshow) removeSlideshowItem(missingId);
    if (fallback) navigate(`/media/${fallback.id}`, { replace: true, state: location.state });
  }, [item, loading, id, navItems, inSlideshow, navigate, location.state, removeSlideshowItem]);

  useEffect(() => {
    if (!inSlideshow || !slideshow.current) return;
    navigate(`/media/${slideshow.current.id}`, { replace: true });
  }, [inSlideshow, slideshow.currentIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!inSlideshow) return;
    const remaining = slideshow.items.length - slideshow.currentIndex;
    const hasMore = slideshow.items.length < slideshow.total;
    if (hasMore && remaining <= 40) slideshow.loadMore();
  }, [inSlideshow, slideshow.currentIndex, slideshow.items.length, slideshow.total]); // eslint-disable-line react-hooks/exhaustive-deps

  const preloadRefs = useRef([]);
  useEffect(() => {
    /* Preload the next media the viewer will actually render so next/prev
       navigation feels instant. Images are warmed via /image/:id (the URL the
       viewer shows, not the thumbnail). Videos are skipped — preloading video
       streams is too expensive. This runs for both slideshow and folder/liked
       navigation. */
    const sequence = inSlideshow ? slideshow.items : navItems;
    const startIdx = inSlideshow ? slideshow.currentIndex : currentIndex;
    if (startIdx < 0) return;
    preloadRefs.current = [1, 2].flatMap(offset => {
      const next = sequence[startIdx + offset];
      if (!next || next.type !== MEDIA_TYPE.IMAGE) return [];
      const img = new Image();
      img.src = getImageUrl(next.id);
      return [img];
    });
  }, [inSlideshow, slideshow.currentIndex, currentIndex, navItems]); // eslint-disable-line react-hooks/exhaustive-deps

  const goPrev = useCallback(() => {
    if (!hasPrev) return;
    if (inSlideshow) slideshow.prev();
    else navigate(`/media/${navItems[currentIndex - 1].id}`, { replace: true, state: location.state });
  }, [hasPrev, inSlideshow, slideshow, navigate, navItems, currentIndex, location.state]);

  const goNext = useCallback(() => {
    if (!hasNext) return;
    if (inSlideshow) slideshow.next();
    else navigate(`/media/${navItems[currentIndex + 1].id}`, { replace: true, state: location.state });
  }, [hasNext, inSlideshow, slideshow, navigate, navItems, currentIndex, location.state]);

  const [folderNavLoading, setFolderNavLoading] = useState(false);
  const folderNavInFlight = useRef(false);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const mobileNavTimer = useRef(null);

  const ensureFolderSiblings = useCallback(async () => {
    if (!item?.folder) return [];
    if (folderMedia.length > 0 && folderMedia.some(m => m.id === item.id)) return folderMedia;
    if (folderNavInFlight.current) return folderMedia;
    folderNavInFlight.current = true;
    setFolderNavLoading(true);
    try {
      /* Force a server fetch: IDB may only hold a partial subset of the folder
         (e.g. after a shuffle), which would make folder up/down navigation
         fail or collapse the controls. */
      const { items } = await fetchMedia({ folder: item.folder, sort, skipCache: true });
      const sorted = applySort(items, sort);
      setFolderMedia(sorted);
      return sorted;
    } catch (err) { console.error('Failed to load folder siblings:', err); return []; }
    finally { folderNavInFlight.current = false; setFolderNavLoading(false); }
  }, [item, folderMedia]); // eslint-disable-line react-hooks/exhaustive-deps

  const folderIndex = folderMedia.length > 0 && item ? folderMedia.findIndex(m => m.id === item.id) : -1;
  const hasFolderPrev = inSlideshow && !!item?.folder && (folderIndex < 0 || folderIndex > 0);
  const hasFolderNext = inSlideshow && !!item?.folder && (folderIndex < 0 || folderIndex < folderMedia.length - 1);

  const goFolderPrev = useCallback(async () => {
    if (!hasFolderPrev) return;
    const siblings = await ensureFolderSiblings();
    const idx = siblings.findIndex(m => m.id === Number(id));
    if (idx > 0) { setItem(siblings[idx - 1]); navigate(`/media/${siblings[idx - 1].id}`, { replace: true, state: location.state }); }
  }, [hasFolderPrev, ensureFolderSiblings, id, navigate, location.state]);

  const goFolderNext = useCallback(async () => {
    if (!hasFolderNext) return;
    const siblings = await ensureFolderSiblings();
    const idx = siblings.findIndex(m => m.id === Number(id));
    if (idx >= 0 && idx < siblings.length - 1) { setItem(siblings[idx + 1]); navigate(`/media/${siblings[idx + 1].id}`, { replace: true, state: location.state }); }
  }, [hasFolderNext, ensureFolderSiblings, id, navigate, location.state]);

  const toggleFullscreen = useCallback(() => {
    if (!viewerRef.current) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else viewerRef.current.requestFullscreen();
  }, []);

  const handleLike = useCallback(async () => {
    if (!item) return;
    const mediaId = item.id;
    /* Optimistic: bump immediately (functional so rapid presses each add one).
       The requests themselves are coalesced into one by the like debounce. */
    setItem(prev => (prev ? { ...prev, likes: (prev.likes || 0) + 1 } : prev));
    try {
      const { item: updated, likedCount } = await likeMediaApi(mediaId);
      if (updated) setItem(prev => (prev && prev.id === mediaId ? { ...prev, ...updated } : prev));
      /* Update the sidebar liked count directly from the response. */
      if (likedCount != null) setLikedCount(likedCount);
    } catch (err) {
      console.error('Failed to like media:', err);
      /* Re-sync with the server (the likes were not applied). */
      try {
        const fresh = await fetchMediaById(mediaId, { skipCache: true });
        if (fresh) setItem(prev => (prev && prev.id === mediaId ? fresh : prev));
      } catch { /* ignore */ }
    }
  }, [item?.id, setLikedCount]);

  const cancelTouchGesture = useCallback(() => {
    touchStartX.current = null;
    touchStartY.current = null;
  }, []);

  const handleTouchStart = useCallback((e) => {
    cancelTouchGesture();
    if (e.touches.length !== 1 || e.target.closest('button, input, a')) return;
    if (e.target.tagName === 'VIDEO' && isVideoControlPress(e.target.getBoundingClientRect(), e.touches[0].clientY)) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, [cancelTouchGesture]);

  const showMobileNavPanel = useCallback(() => {
    setShowMobileNav(true);
    clearTimeout(mobileNavTimer.current);
    mobileNavTimer.current = setTimeout(() => setShowMobileNav(false), 2500);
  }, []);

  const handleTouchEnd = useCallback((e) => {
    if (e.changedTouches.length !== 1 || touchStartX.current === null) { cancelTouchGesture(); return; }
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    cancelTouchGesture();
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 10) { showMobileNavPanel(); return; }
    if (Math.abs(dx) < 50 || Math.abs(dx) <= Math.abs(dy)) return;
    if (dx < 0) goNext(); else goPrev();
  }, [goNext, goPrev, showMobileNavPanel, cancelTouchGesture]);

  const handleSetFolderThumbnail = useCallback(async (time = null) => {
    if (!item || !folder) return;
    try {
      await setFolderThumbnail(folder.id, item.id, time);
      bump();
      dispatch({ type: actions.TOAST_SHOWN, message: 'Folder thumbnail updated', toastType: 'success' });
    } catch (err) {
      console.error('Failed to set folder thumbnail:', err);
      dispatch({ type: actions.TOAST_SHOWN, message: 'Could not set folder thumbnail', toastType: 'error' });
    }
  }, [item, folder, bump, dispatch]);

  const handleSetVideoThumbnail = useCallback(async () => {
    if (!item || item.type === MEDIA_TYPE.IMAGE) return;
    const time = playerRef.current?.getCurrentTime() ?? 0;
    try {
      await setVideoThumbnail(item.id, time);
      setItem(prev => prev ? { ...prev, thumbnail_time: time } : prev);
      bump();
      dispatch({ type: actions.TOAST_SHOWN, message: 'Video thumbnail updated', toastType: 'success' });
    } catch (err) {
      console.error('Failed to set video thumbnail:', err);
      dispatch({ type: actions.TOAST_SHOWN, message: 'Could not set video thumbnail', toastType: 'error' });
    }
  }, [item, bump, dispatch]);

  const handleDelete = useCallback(async () => {
    if (!item) return;
    setShowDelete(false);
    const deletedId = item.id;

    /* Up/down navigation happens within the folder sibling list, even in a
       slideshow. Pick the next item from the same source we are navigating
       through, so deletion continues the sequence instead of jumping to a
       different order (or to the deleted item). */
    const folderIdx = folderMedia.findIndex(m => m.id === deletedId);
    const folderNext = folderIdx >= 0
      ? (folderMedia[folderIdx + 1] ?? folderMedia[folderIdx - 1])
      : null;
    const slideshowNext = navItems[currentIndex + 1] ?? navItems[currentIndex - 1];
    /* In a liked nav session the sequence is the liked list itself; otherwise
       follow the folder sequence, falling back to the slideshow when the
       deleted item was the sole folder sibling. */
    const nextItem = isLikedNav
      ? slideshowNext
      : folderIdx >= 0 ? (folderNext ?? slideshowNext) : slideshowNext;

    if (nextItem) {
      /* In a slideshow the route change alone does not update the displayed
         item: the slideshow effect only re-runs when the sequence advances,
         and up/down folder navigation does not advance it. Follow the next
         item explicitly so the deleted media is never left on screen. */
      if (inSlideshow) setItem(nextItem);
      navigate(`/media/${nextItem.id}`, { replace: true, state: location.state });
    } else {
      navigate(isLikedNav ? '/liked' : (folder ? `/folder/${folder.id}` : '/dashboard'), { replace: true });
    }

    /* Drop the deleted item from both the slideshow and the folder sibling
       list so subsequent up/down navigation doesn't target a dead id. */
    if (inSlideshow) removeSlideshowItem(deletedId);
    setFolderMedia(list => list.filter(m => m.id !== deletedId));
    if (isLikedNav) setLikedNavList(list => list.filter(m => m.id !== deletedId));

    try {
      await deleteMedia(deletedId);
      bump();
    }
    catch (err) {
      console.error('Failed to delete media:', err);
      dispatch({ type: actions.TOAST_SHOWN, message: 'Could not delete media', toastType: 'error' });
    }
  }, [item, navItems, currentIndex, folderMedia, navigate, folder, inSlideshow, removeSlideshowItem, deleteMedia, bump, isLikedNav]);

  /* Merge this item's duplicate copies into it. The item on screen is passed as
     `keepId` so the current variant wins the purge; likes and tags are combined
     server-side and the other files are removed from disk. */
  const handleMerge = useCallback(async () => {
    if (!item || duplicates.count < 2 || !duplicates.ids.includes(item.id)) return;
    setShowMerge(false);
    try {
      const result = await mergeDuplicatesApi({ ids: duplicates.ids, keepId: item.id });
      const master = result.media;
      /* Drop every merged-away copy from all navigation lists (slideshow, folder
         siblings, liked) so next/prev can never land on a deleted file. This
         includes the current item when a surviving copy became the master. */
      const removed = new Set((result.removedIds ?? []).map(Number));
      if (inSlideshow) removed.forEach(id => removeSlideshowItem(id));
      if (removed.size > 0) {
        setFolderMedia(list => list.filter(m => !removed.has(m.id)));
        setLikedNavList(list => list.filter(m => !removed.has(m.id)));
      }
      if (master) {
        if (master.id !== item.id) {
          /* The current item's file was missing, so a surviving copy won.
             Follow the master so the URL and view stay in sync. */
          setItem(master);
          if (!inSlideshow) navigate(`/media/${master.id}`, { replace: true, state: location.state });
        } else {
          setItem(prev => (prev ? { ...prev, ...master } : prev));
        }
      }
      setDuplicates({ ids: [master?.id ?? item.id], count: 1, items: master ? [master] : [] });
      bump();
      dispatch({ type: actions.TOAST_SHOWN, message: `Merged ${result.merged} duplicate${result.merged === 1 ? '' : 's'}`, toastType: 'success' });
    } catch (err) {
      console.error('Failed to merge duplicates:', err);
      dispatch({ type: actions.TOAST_SHOWN, message: 'Could not merge duplicates', toastType: 'error' });
    }
  }, [item, duplicates, bump, dispatch, navigate, location.state, inSlideshow, removeSlideshowItem]);

  /* Ask the server to repair the current item. `force` discards the existing
     transcoded output and re-encodes from the original (for a "ready" file that
     won't play); otherwise it reconciles the record with what's on disk. */
  const runRepair = useCallback(async (force) => {
    if (!item) return;
    setFixing(true);
    try {
      const result = await repairFailed({ ids: [item.id], force });
      if (result.repaired > 0) {
        const detail = result.requeued > 0 ? 're-queued for transcoding' : 'restored';
        dispatch({ type: actions.TOAST_SHOWN, message: `${force ? 'Re-transcoding' : 'Fixed'} — ${detail}`, toastType: 'success' });
        try {
          const fresh = await fetchMediaById(item.id, { skipCache: true });
          setItem(fresh);
        } catch { /* keep the current item; polling will catch up */ }
        setPlaybackError(false);
        bump();
      } else {
        dispatch({
          type: actions.TOAST_SHOWN,
          message: force ? 'Could not re-transcode — original file is missing' : 'Could not fix this media',
          toastType: 'error',
        });
      }
    } catch (err) {
      console.error('Failed to repair media:', err);
      dispatch({ type: actions.TOAST_SHOWN, message: 'Could not repair media', toastType: 'error' });
    } finally {
      setFixing(false);
    }
  }, [item, dispatch, bump]);

  const handleFix = useCallback(() => runRepair(false), [runRepair]);
  const handleRetranscode = useCallback(() => runRepair(true), [runRepair]);

  /* A new item gets a fresh playback state. */
  useEffect(() => { setPlaybackError(false); }, [id]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const handleTitleDoubleClick = useCallback(() => {
    if (!item) return;
    setTitleDraft(item.title);
    setEditingTitle(true);
    setTimeout(() => { titleInputRef.current?.select(); }, 0);
  }, [item]);

  const commitTitle = useCallback(async () => {
    const trimmed = titleDraft.trim();
    setEditingTitle(false);
    if (!trimmed || trimmed === item?.title) return;
    setItem(prev => ({ ...prev, title: trimmed }));
    try { await renameMedia(item.id, trimmed); }
    catch (err) { console.error('Failed to rename media:', err); setItem(prev => ({ ...prev, title: item.title })); }
  }, [titleDraft, item]);

  useEffect(() => {
    if (!addingTag) return;
    setTimeout(() => tagInputRef.current?.focus(), 0);
    fetchTags().then(data => setAllTags(data.map(t => t.tag))).catch(() => {});
  }, [addingTag]);

  const suggestions = useMemo(() => {
    const trimmed = tagDraft.trim().toLowerCase();
    if (!trimmed) return [];
    const existing = new Set(safeTags(item?.tags));
    return allTags.filter(t => t.toLowerCase().includes(trimmed) && !existing.has(t)).slice(0, 6);
  }, [tagDraft, allTags, item?.tags]);

  const handleRemoveTag = useCallback(async (tagToRemove) => {
    if (!item) return;
    const targetId = item.id;
    const originalTags = safeTags(item.tags);
    const newTags = originalTags.filter(t => t !== tagToRemove);
    setItem(prev => ({ ...prev, tags: newTags }));
    try {
      const { item: updated, tagCount } = await updateMediaTags(targetId, newTags);
      setItem(prev => prev?.id === targetId ? { ...prev, ...updated } : prev);
      if (tagCount != null) setTagCount(tagCount);
    } catch (err) {
      console.error('Failed to remove tag:', err);
      setItem(prev => prev?.id === targetId ? { ...prev, tags: originalTags } : prev);
    }
  }, [item, setTagCount]);

  const applyTag = useCallback(async (tag) => {
    if (!tag || safeTags(item?.tags).includes(tag)) return;
    const targetId = item.id;
    const originalTags = safeTags(item.tags);
    const newTags = [...originalTags, tag];
    setItem(prev => ({ ...prev, tags: newTags }));
    try {
      const { item: updated, tagCount } = await updateMediaTags(targetId, newTags);
      setItem(prev => prev?.id === targetId ? { ...prev, ...updated } : prev);
      if (tagCount != null) setTagCount(tagCount);
    } catch (err) {
      console.error('Failed to add tag:', err);
      setItem(prev => prev?.id === targetId ? { ...prev, tags: originalTags } : prev);
    }
  }, [item, setTagCount]);

  const selectSuggestion = useCallback((tag) => {
    setAddingTag(false); setTagDraft(''); setSuggestionIndex(-1); applyTag(tag);
  }, [applyTag]);

  const commitTag = useCallback(async () => {
    const trimmed = tagDraft.trim();
    setAddingTag(false); setTagDraft(''); setSuggestionIndex(-1); applyTag(trimmed);
  }, [tagDraft, applyTag]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (showDelete || showMerge) return; /* modals capture their own keys */
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowUp') { e.preventDefault(); goFolderPrev(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); goFolderNext(); }
      if (e.key === ' ') { e.preventDefault(); playerRef.current?.togglePlay(); }
      if (e.key === 'Enter') { e.preventDefault(); handleLike(); }
      if (e.key === 'i') setShowInfo(prev => !prev);
      if (e.key === 'f') toggleFullscreen();
      if (e.key === 'Delete') setShowDelete(true);
      if (e.key === 't' || e.key === 'T') setAddingTag(true);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [goPrev, goNext, goFolderPrev, goFolderNext, handleLike, toggleFullscreen, setShowDelete, showDelete, showMerge]);

  /* Delete confirmation modal: Enter confirms, Escape closes. Escape already
     works via the shared Modal component; wire Enter here. */
  useEffect(() => {
    if (!showDelete) return;
    const handleDeleteKey = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); handleDelete(); }
    };
    document.addEventListener('keydown', handleDeleteKey);
    return () => document.removeEventListener('keydown', handleDeleteKey);
  }, [showDelete, handleDelete]);

  useEffect(() => {
    if (!showInfo || !item) return;
    setFileStatus(null);
    fetch(`/media/${item.id}/status`)
      .then(r => r.json())
      .then(setFileStatus)
      .catch(() => setFileStatus({ ok: false, error: 'Could not check status' }));
  }, [showInfo, item]);

  /* Breadcrumbs are derived synchronously from the item's folder path using the
     already-loaded folder list, so they render on the first paint — no async
     chain fetch and no empty bar in between. `item.folder_chain` (returned by
     /media/:id) is preferred when present. */
  const breadcrumbs = useMemo(() => {
    if (item?.folder_chain?.length) return item.folder_chain;
    if (!item?.folder || folders.length === 0) return [];

    const byPath = new Map(folders.map(f => [f.path, f]));
    const byId = new Map(folders.map(f => [f.id, f]));
    const target = byPath.get(item.folder);
    if (!target) return [];

    const chain = [];
    const seen = new Set();
    let node = target;
    while (node && !seen.has(node.id)) {
      seen.add(node.id);
      chain.unshift({ id: node.id, path: node.path, name: node.name });
      node = node.parentId != null ? byId.get(node.parentId) : null;
    }
    return chain;
  }, [item?.folder_chain, item?.folder, folders]);

  const backTarget = isLikedNav ? '/liked' : (folder ? `/folder/${folder.id}` : '/dashboard');
  const goBack = useCallback(() => {
    navigate(backTarget);
  }, [navigate, backTarget]);

  if (loading && !item) return <div className="page-loader"><Loader message={loadingMessage} /></div>;

  if (!item) {
    return (
      <EmptyState
        icon={<Icon name="image" className="icon-2xl" />}
        title="Media not found"
        description="This media item doesn't exist."
        action={{ label: 'Go to Library', onClick: () => navigate('/dashboard') }}
      />
    );
  }

  const isImage = item.type === MEDIA_TYPE.IMAGE;
  const mediaUrl = getMediaUrl(item);
  /* Only offer merging when the loaded duplicate group actually contains the
     item on screen, so a stale group from a previous item never leaks in. */
  const canMerge = duplicates.count > 1 && duplicates.ids.includes(item.id);

  /* Overflow actions (Download + "Use as...") shared by the desktop action bar
     and the mobile kebab menu so the two never drift apart. `onAction`
     runs after each click (the kebab menu uses it to close itself). */
  const renderOverflowActions = (extraClass = '', onAction = () => {}) => (
    <>
      <Button variant="ghost" size="sm" icon={<Icon name="download" className="icon-sm" />} className={extraClass} onClick={() => { onAction(); downloadMedia(item); }}>Download</Button>
      {isImage && folder && (
        <Button variant="ghost" size="sm" icon={<Icon name="image" className="icon-sm" />} className={extraClass} onClick={() => { onAction(); handleSetFolderThumbnail(); }}>Use as folder thumbnail</Button>
      )}
      {!isImage && folder && item.status === MEDIA_STATUS.READY && (
        <Button variant="ghost" size="sm" icon={<Icon name="video" className="icon-sm" />} className={extraClass} onClick={() => { onAction(); handleSetFolderThumbnail(playerRef.current?.getCurrentTime()); }}>Use frame for folder</Button>
      )}
      {!isImage && item.status === MEDIA_STATUS.READY && (
        <Button variant="ghost" size="sm" icon={<Icon name="video" className="icon-sm" />} className={extraClass} onClick={() => { onAction(); handleSetVideoThumbnail(); }}>Use frame for video</Button>
      )}
    </>
  );

  return (
    <div ref={viewerRef} className={`viewer${isFullscreen ? ' viewer-fullscreen' : ''}`}>
      {!isFullscreen && (
        <div className="viewer-topbar">
          <IconButton
            icon={<Icon name="prev" className="icon-sm" />}
            label="Back"
            onClick={goBack}
          />
          <nav className="breadcrumb-nav">
            <Button variant="text" onClick={() => navigate('/dashboard')}>Library</Button>
            {breadcrumbs.map((crumb) => {
              const name = crumb.path.split(/[/\\]/).filter(Boolean).pop();
              return (
                <span key={crumb.id} style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <span className="breadcrumb-sep">/</span>
                  <Button variant="text" onClick={() => navigate(`/folder/${crumb.id}`)}>{name}</Button>
                </span>
              );
            })}
          </nav>
        </div>
      )}

      <div
        className="viewer-viewport"
        ref={mediaViewportRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={cancelTouchGesture}
      >
        {isImage ? (
          <ImageViewer src={mediaUrl} alt={item.title} onMagnify={cancelTouchGesture} />
        ) : item.status === MEDIA_STATUS.ERROR ? (
          <div className="media-error">
            <p className="media-error-msg">Processing failed</p>
            {item.job_error && <p className="media-error-detail">{item.job_error}</p>}
            <p className="media-error-path">{item.path}</p>
            <Button
              variant="primary"
              size="sm"
              icon={<Icon name="wrench" className="icon-sm" />}
              onClick={handleFix}
              disabled={fixing}
            >
              {fixing ? 'Fixing…' : 'Fix'}
            </Button>
          </div>
        ) : item.status !== MEDIA_STATUS.READY ? (
          <div className="media-processing">
            {item.status === MEDIA_STATUS.TRANSCODING ? (() => {
              const pct = progressSecs !== null && item.duration > 0
                ? Math.min(99, Math.round((progressSecs / item.duration) * 100))
                : null;
              const label = pct !== null
                ? `Transcoding… ${pct}%`
                : progressSecs !== null
                  ? `Transcoding… ${Math.round(progressSecs)}s`
                  : 'Transcoding…';
              return (
                <>
                  {pct !== null
                    ? <ProgressBar value={pct} width={20} showPct={false} />
                    : <ProgressBar width={20} indeterminate showPct={false} />}
                  <p className="media-processing-msg">{label}</p>
                </>
              );
            })() : (() => {
              const STATUS_LABEL = {
                pending: 'Preparing…',
                probing: 'Analysing file…',
                probed: 'Queued for transcoding…',
              };
              return (
                <>
                  <ProgressBar width={20} indeterminate showPct={false} />
                  <p className="media-processing-msg">{STATUS_LABEL[item.status] ?? `${item.status}…`}</p>
                </>
              );
            })()}
          </div>
        ) : (
          <MediaPlayer ref={playerRef} src={mediaUrl} title={item.title} onError={() => setPlaybackError(true)} onMagnify={cancelTouchGesture} />
        )}

        <IconButton
          variant="overlay"
          icon={<Icon name="prev" className="icon-xl" />}
          label="Previous"
          size="lg"
          onClick={goPrev}
          disabled={!hasPrev}
          className="viewer-nav viewer-nav-left"
        />

        <IconButton
          variant="overlay"
          icon={<Icon name="next" className="icon-xl" />}
          label="Next"
          size="lg"
          onClick={goNext}
          disabled={!hasNext}
          className="viewer-nav viewer-nav-right"
        />

        {hasFolderPrev && (
          <IconButton
            variant="overlay"
            icon={folderNavLoading ? <span className="spinner spinner-sm" /> : <Icon name="up" className="icon-xl" />}
            label="Previous in folder"
            size="lg"
            disabled={folderNavLoading}
            onClick={goFolderPrev}
            className="viewer-nav viewer-nav-up"
          />
        )}

        {hasFolderNext && (
          <IconButton
            variant="overlay"
            icon={folderNavLoading ? <span className="spinner spinner-sm" /> : <Icon name="down" className="icon-xl" />}
            label="Next in folder"
            size="lg"
            disabled={folderNavLoading}
            onClick={goFolderNext}
            className="viewer-nav viewer-nav-down"
          />
        )}

        {showMobileNav && (
          <div className="mobile-nav">
            {isImage && (
              <IconButton variant="overlay" icon={<Icon name="prev" className="icon-md" />} label="Previous" onClick={goPrev} disabled={!hasPrev} />
            )}
            {hasFolderPrev && (
              <IconButton variant="overlay" icon={folderNavLoading ? <span className="spinner spinner-sm" /> : <Icon name="up" className="icon-md" />} label="Previous in folder" disabled={folderNavLoading} onClick={goFolderPrev} />
            )}
            {hasFolderNext && (
              <IconButton variant="overlay" icon={folderNavLoading ? <span className="spinner spinner-sm" /> : <Icon name="down" className="icon-md" />} label="Next in folder" disabled={folderNavLoading} onClick={goFolderNext} />
            )}
            {isImage && (
              <IconButton variant="overlay" icon={<Icon name="next" className="icon-md" />} label="Next" onClick={goNext} disabled={!hasNext} />
            )}
          </div>
        )}

        <IconButton
          variant="overlay"
          icon={<Icon name={isFullscreen ? 'minimize' : 'maximize'} className="icon-md" />}
          label={isFullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}
          onClick={toggleFullscreen}
          className="viewer-nav viewer-nav-fs"
        />

        {isFullscreen && navItems.length > 1 && (
          <div className="viewer-counter">
            {currentIndex + 1} / {navItems.length}
          </div>
        )}
      </div>

      {!isFullscreen && (
        <div className="viewer-infobar">
          <div className="viewer-infobar-left">
            {editingTitle ? (
              <input
                ref={titleInputRef}
                className="viewer-title-input"
                value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); commitTitle(); }
                  if (e.key === 'Escape') { e.preventDefault(); setEditingTitle(false); }
                }}
              />
            ) : (
              <h1 className="viewer-title" onDoubleClick={handleTitleDoubleClick} title="Double-click to rename">
                {item.title}
              </h1>
            )}
            <div className="viewer-meta">
              {inSlideshow && <span className="viewer-meta-label">Slideshow</span>}
              {navItems.length > 1 && <span>{currentIndex + 1} / {navItems.length}</span>}
            </div>
            <div className="viewer-tags">
              {safeTags(item.tags).map(tag => (
                <span key={tag} className="tag-chip">
                  <button className="tag-chip-link" onClick={() => navigate(`/tags/${encodeURIComponent(tag)}`)}>
                    {tag}
                  </button>
                  <button className="tag-chip-remove" onClick={() => handleRemoveTag(tag)} aria-label={`Remove tag ${tag}`}>×</button>
                </span>
              ))}
              {addingTag ? (
                <div className="tag-input-wrap">
                  <input
                    ref={tagInputRef}
                    className="tag-input"
                    value={tagDraft}
                    onChange={e => { setTagDraft(e.target.value); setSuggestionIndex(-1); }}
                    onBlur={commitTag}
                    onKeyDown={e => {
                      if (e.key === 'ArrowDown') { e.preventDefault(); setSuggestionIndex(i => Math.min(i + 1, suggestions.length - 1)); }
                      if (e.key === 'ArrowUp') { e.preventDefault(); setSuggestionIndex(i => Math.max(i - 1, -1)); }
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        suggestionIndex >= 0 && suggestions[suggestionIndex]
                          ? selectSuggestion(suggestions[suggestionIndex])
                          : commitTag();
                      }
                      if (e.key === 'Escape') { e.preventDefault(); setAddingTag(false); setTagDraft(''); setSuggestionIndex(-1); }
                    }}
                    placeholder="tag name"
                  />
                  {suggestions.length > 0 && (
                    <div className="tag-suggest">
                      {suggestions.map((tag, i) => (
                        <button
                          key={tag}
                          className={`tag-suggest-item${i === suggestionIndex ? ' active' : ''}`}
                          onMouseDown={e => { e.preventDefault(); selectSuggestion(tag); }}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <button className="tag-add-btn" onClick={() => setAddingTag(true)} title="Add tag (T)">+ tag</button>
              )}
            </div>
          </div>

          <div className="viewer-actions">
            <LikeButton count={item.likes || 0} onLike={handleLike} />
            <Button variant="ghost" size="sm" icon={<Icon name="info" className="icon-sm" />} onClick={() => setShowInfo(true)}>Info</Button>
            {canMerge && (
              <Button variant="ghost" size="sm" icon={<Icon name="copy" className="icon-sm" />} onClick={() => setShowMerge(true)}>
                Merge {duplicates.count} copies
              </Button>
            )}
            {item.status === MEDIA_STATUS.ERROR && (
              <Button variant="ghost" size="sm" icon={<Icon name="wrench" className="icon-sm" />} onClick={handleFix} disabled={fixing}>
                {fixing ? 'Fixing…' : 'Fix'}
              </Button>
            )}
            {!isImage && playbackError && (
              <Button variant="ghost" size="sm" icon={<Icon name="refresh" className="icon-sm" />} onClick={handleRetranscode} disabled={fixing}>
                {fixing ? 'Working…' : (item.transcoded_path ? 'Re-transcode' : 'Transcode')}
              </Button>
            )}
            {renderOverflowActions('viewer-overflow-hidden')}
            <Button variant="danger" size="sm" icon={<Icon name="trash" className="icon-sm" />} onClick={() => setShowDelete(true)} className="viewer-action-push">Delete</Button>
            <IconButton
              size="sm"
              icon={<Icon name="kebab" className="icon-md" />}
              label="More actions"
              onClick={() => setShowMore(true)}
              className="viewer-kebab"
            />
          </div>
        </div>
      )}

      <Modal open={showInfo} onClose={() => setShowInfo(false)} title="Media Info">
        <div className="file-status">
          {fileStatus === null ? (
            <>
              <span className="spinner spinner-sm" />
              <span className="status-mut">Checking file...</span>
            </>
          ) : fileStatus.ok ? (
            <>
              <span className="status-dot status-dot-ok" />
              <span className="status-ok">
                File OK — {fileStatus.size ? `${(fileStatus.size / 1024 / 1024).toFixed(1)} MB` : 'readable'}
              </span>
            </>
          ) : (
            <>
              <span className="status-dot status-dot-err" />
              <span className="status-err">
                File not accessible{fileStatus.error ? ` — ${fileStatus.error}` : ''}
              </span>
            </>
          )}
        </div>

        <table className="info-table">
          <tbody>
            {[
              ['ID', item.id],
              ['Title', item.title],
              ['Type', item.type],
              ['Status', item.status],
              ['Path', item.path],
              ['Hash', item.hash],
              ['Size', fileStatus?.size ? `${(fileStatus.size / 1024 / 1024).toFixed(1)} MB` : item.size ? `${(item.size / 1024 / 1024).toFixed(1)} MB` : null],
              ['Codec', item.codec],
              ['Width', item.width],
              ['Height', item.height],
              ['Duration', item.duration ? `${Math.floor(item.duration / 60)}:${String(Math.floor(item.duration % 60)).padStart(2, '0')}` : null],
              ['Camera', item.camera],
              ['Date Taken', item.date_taken],
              ['Created', item.created_at],
            ].filter(([, v]) => v != null && v !== '').map(([label, value]) => (
              <tr key={label}>
                <td>{label}</td>
                <td>{String(value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Modal>

      <Modal open={showMore} onClose={() => setShowMore(false)} title="More actions" className="viewer-more-modal">
        {renderOverflowActions('', () => setShowMore(false))}
      </Modal>

      <Modal open={showDelete} onClose={() => setShowDelete(false)} title="Delete media">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="warning" className="icon-md text-mut" />
          <p className="text-mut">Delete "<strong>{item?.title}</strong>"? This will remove it from the library and delete the file from disk.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="ghost" size="sm" onClick={() => setShowDelete(false)}>Cancel</Button>
          <Button variant="danger" size="sm" icon={<Icon name="trash" className="icon-sm" />} onClick={handleDelete}>Delete</Button>
        </div>
      </Modal>

      <Modal open={showMerge} onClose={() => setShowMerge(false)} title="Merge duplicates">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="warning" className="icon-md text-mut" />
          <p className="text-mut">
            Merge <strong>{duplicates.count - 1}</strong> duplicate cop{duplicates.count - 1 === 1 ? 'y' : 'ies'} into this one? "<strong>{item?.title}</strong>" is kept, its likes and tags are combined with the other copies, and their files are deleted from disk.
          </p>
        </div>
        {duplicates.items.length > 0 && (
          <ul className="duplicate-path-list">
            {duplicates.items.map(dup => {
              const kept = dup.id === item.id;
              return (
                <li key={dup.id} className={`duplicate-path-item${kept ? ' duplicate-path-kept' : ''}`}>
                  <DuplicateThumb media={dup} />
                  <div className="duplicate-path-info">
                    <span className="duplicate-path-text" title={dup.path}>{dup.path}</span>
                    <span className="duplicate-path-status">
                      <Icon name={kept ? 'copy' : 'trash'} className="icon-sm" />
                      {kept ? 'Kept' : 'Will be deleted'}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="ghost" size="sm" onClick={() => setShowMerge(false)}>Cancel</Button>
          <Button variant="primary" size="sm" icon={<Icon name="copy" className="icon-sm" />} onClick={handleMerge}>Merge</Button>
        </div>
      </Modal>
    </div>
  );
}
