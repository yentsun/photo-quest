import { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useMediaActions } from '../../hooks/useMedia.js';
import { useRefresh } from '../../contexts/RefreshContext.jsx';
import { useSlideshow } from '../../contexts/SlideshowContext.jsx';
import { MEDIA_TYPE, MEDIA_STATUS } from '@photo-quest/shared';
import { ImageViewer, MediaPlayer, LikeButton } from '../media/index.js';
import { EmptyState } from '../layout/index.js';
import { Button, Icon, IconButton, Loader, Modal } from '../ui/index.js';
import { getMediaUrl, getThumbUrl, downloadMedia, fetchMediaById, fetchMedia, fetchFolders, fetchTags, likeMedia as likeMediaApi, renameMedia, updateMediaTags, getLastMediaItem, getLastFolders } from '../../utils/api.js';
import { useJobProgress } from '../../contexts/JobProgressContext.jsx';
import { idbGetMediaById, idbGetMedia, idbGetFolders } from '../../services/idb.js';
import { getPageCache } from '../../utils/pageCache.js';

function byName(a, b) {
  return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });
}

function applySort(items) {
  const result = items.slice().sort(byName);
  const coverIdx = result.findIndex(m => /cover/i.test(m.title));
  if (coverIdx > 0) result.unshift(result.splice(coverIdx, 1)[0]);
  return result;
}

export default function MediaPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { deleteMedia } = useMediaActions();
  const { signal } = useRefresh();
  const slideshow = useSlideshow();
  const [showInfo, setShowInfo] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const titleInputRef = useRef(null);
  const playerRef = useRef(null);
  const [fileStatus, setFileStatus] = useState(null);
  const [addingTag, setAddingTag] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const [allTags, setAllTags] = useState([]);
  const [suggestionIndex, setSuggestionIndex] = useState(-1);
  const tagInputRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const viewerRef = useRef(null);
  const mediaViewportRef = useRef(null);
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const touchStartOnControl = useRef(false);

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
    return getPageCache(`folder:${f.id}:filename`)?.data?.directMedia ?? [];
  });
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
    setItem(slideshow.current);
    setLoading(false);
  }, [inSlideshow, slideshow.current]); // eslint-disable-line react-hooks/exhaustive-deps

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
        const mediaItem = await fetchMediaById(mediaId);
        if (cancelled) return;
        setItem(mediaItem);
        setLoading(false);
        if (mediaItem.folder) {
          const { items: cachedSiblings } = await idbGetMedia({ folder: mediaItem.folder, limit: 200 });
          if (!cancelled && cachedSiblings.length > 0) setFolderMedia(applySort(cachedSiblings));
          const cachedFolders = await idbGetFolders();
          if (!cancelled) { setFolders(cachedFolders); setFolder(cachedFolders.find(f => f.path === mediaItem.folder) || null); }
          setLoadingMessage('folder context…');
          const [folderResult, allFolders] = await Promise.all([fetchMedia({ folder: mediaItem.folder, limit: 200, sort: 'filename' }), fetchFolders()]);
          if (cancelled) return;
          setFolderMedia(applySort(folderResult.items));
          setFolders(allFolders);
          setFolder(allFolders.find(f => f.path === mediaItem.folder) || null);
        }
      } catch (err) { console.error('Failed to load media:', err); if (!cancelled) setItem(null); }
      finally { if (!cancelled) setLoading(false); }
    };
    load();
    return () => { cancelled = true; };
  }, [id, inSlideshow, signal]); // eslint-disable-line react-hooks/exhaustive-deps

  const TERMINAL = [MEDIA_STATUS.READY, MEDIA_STATUS.ERROR];
  useEffect(() => {
    if (!item || item.type !== MEDIA_TYPE.VIDEO || TERMINAL.includes(item.status)) return;
    const interval = setInterval(async () => {
      try { const fresh = await fetchMediaById(Number(id)); setItem(fresh); } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [id, item?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const navItems = inSlideshow ? slideshow.items : folderMedia;
  const currentIndex = navItems.findIndex(m => m.id === Number(id));
  const hasPrev = inSlideshow ? slideshow.history.length > 0 : currentIndex > 0;
  const hasNext = inSlideshow ? navItems.length > 1 : currentIndex < navItems.length - 1;

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
    if (!inSlideshow) return;
    preloadRefs.current = [1, 2].flatMap(offset => {
      const next = slideshow.items[slideshow.currentIndex + offset];
      if (!next || next.type !== MEDIA_TYPE.IMAGE) return [];
      const img = new Image();
      img.src = getThumbUrl(next.id);
      return [img];
    });
  }, [inSlideshow, slideshow.currentIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const goPrev = useCallback(() => {
    if (!hasPrev) return;
    if (inSlideshow) slideshow.prev();
    else navigate(`/media/${navItems[currentIndex - 1].id}`);
  }, [hasPrev, inSlideshow, slideshow, navigate, navItems, currentIndex]);

  const goNext = useCallback(() => {
    if (!hasNext) return;
    if (inSlideshow) slideshow.next();
    else navigate(`/media/${navItems[currentIndex + 1].id}`);
  }, [hasNext, inSlideshow, slideshow, navigate, navItems, currentIndex]);

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
      const { items } = await fetchMedia({ folder: item.folder, sort: 'filename' });
      const sorted = applySort(items);
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
    if (idx > 0) { setItem(siblings[idx - 1]); navigate(`/media/${siblings[idx - 1].id}`); }
  }, [hasFolderPrev, ensureFolderSiblings, id, navigate]);

  const goFolderNext = useCallback(async () => {
    if (!hasFolderNext) return;
    const siblings = await ensureFolderSiblings();
    const idx = siblings.findIndex(m => m.id === Number(id));
    if (idx >= 0 && idx < siblings.length - 1) { setItem(siblings[idx + 1]); navigate(`/media/${siblings[idx + 1].id}`); }
  }, [hasFolderNext, ensureFolderSiblings, id, navigate]);

  const toggleFullscreen = useCallback(() => {
    if (!viewerRef.current) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else viewerRef.current.requestFullscreen();
  }, []);

  const handleLike = useCallback(async () => {
    if (!item) return;
    const originalLikes = item.likes || 0;
    setItem(prev => ({ ...prev, likes: originalLikes + 1 }));
    try { await likeMediaApi(item.id); }
    catch (err) { console.error('Failed to like media:', err); setItem(prev => ({ ...prev, likes: originalLikes })); }
  }, [item]);

  const handleTouchStart = useCallback((e) => {
    if (e.touches.length !== 1) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchStartOnControl.current = !!e.target.closest('button');
  }, []);

  const showMobileNavPanel = useCallback(() => {
    setShowMobileNav(true);
    clearTimeout(mobileNavTimer.current);
    mobileNavTimer.current = setTimeout(() => setShowMobileNav(false), 2500);
  }, []);

  const handleTouchEnd = useCallback((e) => {
    if (e.changedTouches.length !== 1 || touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    touchStartOnControl.current = false;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 10) { showMobileNavPanel(); return; }
    if (Math.abs(dx) < 50) return;
    if (dx < 0) goNext(); else goPrev();
  }, [goNext, goPrev, showMobileNavPanel]);

  const { removeItem: removeSlideshowItem } = slideshow;
  const handleDelete = useCallback(async () => {
    if (!item) return;
    if (!confirm(`Delete "${item.title}"?\n\nThis will remove it from the library AND delete the file from disk.`)) return;
    const nextItem = navItems[currentIndex + 1] ?? navItems[currentIndex - 1];
    const deletedId = item.id;
    if (nextItem) navigate(`/media/${nextItem.id}`, { replace: true });
    else navigate(folder ? `/folder/${folder.id}` : '/dashboard', { replace: true });
    if (inSlideshow) removeSlideshowItem(deletedId);
    try { await deleteMedia(deletedId); }
    catch (err) { console.error('Failed to delete media:', err); }
  }, [item, navItems, currentIndex, navigate, folder, inSlideshow, removeSlideshowItem, deleteMedia]);

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
    const existing = new Set(item?.tags || []);
    return allTags.filter(t => t.toLowerCase().includes(trimmed) && !existing.has(t)).slice(0, 6);
  }, [tagDraft, allTags, item?.tags]);

  const handleRemoveTag = useCallback(async (tagToRemove) => {
    if (!item) return;
    const targetId = item.id;
    const originalTags = item.tags || [];
    const newTags = originalTags.filter(t => t !== tagToRemove);
    setItem(prev => ({ ...prev, tags: newTags }));
    try {
      const updated = await updateMediaTags(targetId, newTags);
      setItem(prev => prev?.id === targetId ? { ...prev, ...updated } : prev);
    } catch (err) {
      console.error('Failed to remove tag:', err);
      setItem(prev => prev?.id === targetId ? { ...prev, tags: originalTags } : prev);
    }
  }, [item]);

  const applyTag = useCallback(async (tag) => {
    if (!tag || (item?.tags || []).includes(tag)) return;
    const targetId = item.id;
    const originalTags = item.tags || [];
    const newTags = [...originalTags, tag];
    setItem(prev => ({ ...prev, tags: newTags }));
    try {
      const updated = await updateMediaTags(targetId, newTags);
      setItem(prev => prev?.id === targetId ? { ...prev, ...updated } : prev);
    } catch (err) {
      console.error('Failed to add tag:', err);
      setItem(prev => prev?.id === targetId ? { ...prev, tags: originalTags } : prev);
    }
  }, [item]);

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
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowUp') { e.preventDefault(); goFolderPrev(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); goFolderNext(); }
      if (e.key === ' ') { e.preventDefault(); playerRef.current?.togglePlay(); }
      if (e.key === 'Enter') { e.preventDefault(); handleLike(); }
      if (e.key === 'i') setShowInfo(prev => !prev);
      if (e.key === 'f') toggleFullscreen();
      if (e.key === 'Delete') handleDelete();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [goPrev, goNext, goFolderPrev, goFolderNext, handleLike, toggleFullscreen, handleDelete]);

  useEffect(() => {
    if (!showInfo || !item) return;
    setFileStatus(null);
    fetch(`/media/${item.id}/status`)
      .then(r => r.json())
      .then(setFileStatus)
      .catch(() => setFileStatus({ ok: false, error: 'Could not check status' }));
  }, [showInfo, item]);

  const breadcrumbs = useMemo(() => {
    if (!folder) return [];
    const crumbs = [];
    let current = folder;
    while (current) {
      crumbs.unshift(current);
      current = current.parentId ? folders.find(f => f.id === current.parentId) : null;
    }
    return crumbs;
  }, [folders, folder]);

  const backTarget = folder ? `/folder/${folder.id}` : '/dashboard';
  const goBack = useCallback(() => {
    if (location.key !== 'default') navigate(-1);
    else navigate(backTarget);
  }, [location.key, navigate, backTarget]);

  if (loading) return <div className="page-loader"><Loader message={loadingMessage} /></div>;

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
      >
        {isImage ? (
          <ImageViewer src={mediaUrl} alt={item.title} />
        ) : item.status === MEDIA_STATUS.ERROR ? (
          <div className="media-error">
            <p className="media-error-msg">Processing failed</p>
            {item.job_error && <p className="media-error-detail">{item.job_error}</p>}
            <p className="media-error-path">{item.path}</p>
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
                  <div className="media-processing-progress">
                    <div
                      className={pct !== null ? 'media-processing-progress-fill' : 'media-processing-progress-fill media-processing-progress-indeterminate'}
                      style={pct !== null ? { width: `${pct}%` } : undefined}
                    />
                  </div>
                  <p className="media-processing-msg">{label}</p>
                </>
              );
            })() : (() => {
              const STATUS_LABEL = {
                pending: 'Preparing…',
                probing: 'Analysing file…',
                probed: 'Starting transcode…',
              };
              return (
                <>
                  <div className="media-processing-progress">
                    <div className="media-processing-progress-fill media-processing-progress-indeterminate" />
                  </div>
                  <p className="media-processing-msg">{STATUS_LABEL[item.status] ?? `${item.status}…`}</p>
                </>
              );
            })()}
          </div>
        ) : (
          <MediaPlayer ref={playerRef} src={mediaUrl} title={item.title} />
        )}

        {hasPrev && (
          <IconButton
            variant="overlay"
            icon={<Icon name="prev" className="icon-xl" />}
            label="Previous"
            size="lg"
            onClick={goPrev}
            className="viewer-nav viewer-nav-left"
          />
        )}

        {hasNext && (
          <IconButton
            variant="overlay"
            icon={<Icon name="next" className="icon-xl" />}
            label="Next"
            size="lg"
            onClick={goNext}
            className="viewer-nav viewer-nav-right"
          />
        )}

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
            {isImage && hasPrev && (
              <IconButton variant="overlay" icon={<Icon name="prev" className="icon-md" />} label="Previous" onClick={goPrev} />
            )}
            {hasFolderPrev && (
              <IconButton variant="overlay" icon={folderNavLoading ? <span className="spinner spinner-sm" /> : <Icon name="up" className="icon-md" />} label="Previous in folder" disabled={folderNavLoading} onClick={goFolderPrev} />
            )}
            {hasFolderNext && (
              <IconButton variant="overlay" icon={folderNavLoading ? <span className="spinner spinner-sm" /> : <Icon name="down" className="icon-md" />} label="Next in folder" disabled={folderNavLoading} onClick={goFolderNext} />
            )}
            {isImage && hasNext && (
              <IconButton variant="overlay" icon={<Icon name="next" className="icon-md" />} label="Next" onClick={goNext} />
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
              {(item.tags || []).map(tag => (
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
                <button className="tag-add-btn" onClick={() => setAddingTag(true)}>+ tag</button>
              )}
            </div>
          </div>

          <div className="viewer-actions">
            <Button variant="ghost" size="sm" icon={<Icon name="info" className="icon-sm" />} onClick={() => setShowInfo(true)}>Info</Button>
            <Button variant="ghost" size="sm" icon={<Icon name="download" className="icon-sm" />} onClick={() => downloadMedia(item)}>Download</Button>
            <Button variant="danger" size="sm" icon={<Icon name="trash" className="icon-sm" />} onClick={handleDelete}>Delete</Button>
            <LikeButton count={item.likes || 0} onLike={handleLike} />
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
    </div>
  );
}
