import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { View, Text, Pressable, Platform, PanResponder } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMediaActions } from '../../hooks/useMedia';
import { useRefresh } from '../../contexts/RefreshContext';
import { useGlobal } from '../../contexts/GlobalContext';
import { usePlaylist } from '../../contexts/PlaylistContext';
import { useFullscreen } from '../../contexts/FullscreenContext';
import { MEDIA_TYPE, MEDIA_STATUS, actions as act } from '@photo-quest/shared';
import ImageViewer from '../../components/ImageViewer';
import MediaPlayer from '../../components/MediaPlayer';
import Button from '../../components/Button';
import Icon from '../../components/Icon';
import IconButton from '../../components/IconButton';
import Modal from '../../components/Modal';
import ProgressBar from '../../components/ProgressBar';
import Loader from '../../components/Loader';
import { getMediaUrl, fetchMediaById, fetchMedia, fetchFolders, fetchTags, likeMedia, downloadMedia, renameMedia, updateMediaTags, deleteMedia, setFolderThumbnail, setVideoThumbnail } from '../../services/api';
import { useJobProgress } from '../../contexts/JobProgressContext';
import Breadcrumbs from '../../components/Breadcrumbs';
import Tag from '../../components/Tag';
import LikeFlash from '../../components/LikeFlash';
import { colors, fontSize, fontFamily, space } from '../../theme/tokens';

function safeTags(tags) {
  if (Array.isArray(tags)) return tags;
  if (typeof tags === 'string') { try { return JSON.parse(tags); } catch { return []; } }
  return [];
}

export default function MediaPage() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { dispatch } = useGlobal();
  const { bump } = useRefresh();
  const { removeFolder } = useMediaActions();
  const { playlist, goNext, goPrev } = usePlaylist();
  const { fullscreen, setFullscreen } = useFullscreen();

  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const playerRef = useRef(null);
  const [showInfo, setShowInfo] = useState(false);
  const [fileStatus, setFileStatus] = useState(null);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [addingTag, setAddingTag] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const [allTags, setAllTags] = useState([]);
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const folder = breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1] : null;
  const [folderSiblings, setFolderSiblings] = useState([]);
  const [tagSuggestions, setTagSuggestions] = useState([]);
  const [suggestionIndex, setSuggestionIndex] = useState(-1);
  const [likeFlash, setLikeFlash] = useState(null);

  const progressSecs = useJobProgress(item?.id);

  const navigateToItem = useCallback((targetId) => {
    if (!targetId) return;
    router.replace(`/media/${targetId}`);
  }, [router]);

  const toggleFullscreen = useCallback(() => {
    const next = !fullscreen;
    setFullscreen(next);
    if (Platform.OS === 'web') {
      if (next) {
        const el = document.getElementById('app-root');
        el?.requestFullscreen?.()?.catch?.(() => {});
      } else if (document.fullscreenElement) {
        document.exitFullscreen();
      }
    }
  }, [fullscreen, setFullscreen]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onFsChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, [setFullscreen]);

  const goPrevItem = useCallback(() => {
    const currentId = Number(id);
    if (playlist.ids.length > 1) {
      const idx = playlist.ids.indexOf(currentId);
      if (idx !== -1) { goPrev(); navigateToItem(playlist.ids[(idx - 1 + playlist.ids.length) % playlist.ids.length]); }
    } else if (folderSiblings.length > 1) {
      const idx = folderSiblings.findIndex(m => m.id === currentId);
      if (idx > 0) navigateToItem(folderSiblings[idx - 1].id);
    }
  }, [id, playlist, folderSiblings, goPrev, navigateToItem]);

  const goNextItem = useCallback(() => {
    const currentId = Number(id);
    if (playlist.ids.length > 1) {
      const idx = playlist.ids.indexOf(currentId);
      if (idx !== -1) { goNext(); navigateToItem(playlist.ids[(idx + 1) % playlist.ids.length]); }
    } else if (folderSiblings.length > 1) {
      const idx = folderSiblings.findIndex(m => m.id === currentId);
      if (idx >= 0 && idx < folderSiblings.length - 1) navigateToItem(folderSiblings[idx + 1].id);
    }
  }, [id, playlist, folderSiblings, goNext, navigateToItem]);

  const swipeNav = useCallback((dx) => {
    if (dx > 80) goPrevItem();
    else if (dx < -80) goNextItem();
  }, [goPrevItem, goNextItem]);

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 20 && Math.abs(gs.dx) > Math.abs(gs.dy),
    onPanResponderRelease: (_, gs) => swipeNav(gs.dx),
  }), [swipeNav]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const mediaItem = await fetchMediaById(Number(id));
        if (cancelled) return;
        setItem(mediaItem);
        if (mediaItem.folder) {
          const folders = await fetchFolders().catch(() => []);
          if (cancelled) return;
          const pathToId = new Map(folders.map(f => [f.path, f.id]));
          const sep = mediaItem.folder.includes('\\') ? '\\' : '/';
          const parts = mediaItem.folder.split(sep).filter(Boolean);
          const crumbs = [];
          let current = '';
          for (const part of parts) {
            current = current ? current + sep + part : part;
            const folderId = pathToId.get(current);
            crumbs.push({ id: folderId ?? null, name: part });
          }
          setBreadcrumbs(crumbs);
        }
        if (mediaItem.folder) {
          fetchMedia({ folder: mediaItem.folder, limit: 10000, sort: 'filename' })
            .then(({ items }) => { if (!cancelled) setFolderSiblings(items); })
            .catch(() => {});
        }
      } catch (err) { console.error(err); }
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (!item || item.type !== MEDIA_TYPE.VIDEO || [MEDIA_STATUS.READY, MEDIA_STATUS.ERROR].includes(item.status)) return;
    const interval = setInterval(async () => {
      try { const fresh = await fetchMediaById(Number(id)); setItem(fresh); } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, [id, item?.status]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = (e) => {
      if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrevItem(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); goNextItem(); }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const idx = folderSiblings.findIndex(m => m.id === Number(id));
        if (idx > 0) navigateToItem(folderSiblings[idx - 1].id);
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const idx = folderSiblings.findIndex(m => m.id === Number(id));
        if (idx >= 0 && idx < folderSiblings.length - 1) navigateToItem(folderSiblings[idx + 1].id);
      }
      if (e.key === ' ') { e.preventDefault(); playerRef.current?.togglePlay(); }
      if (e.key === 'Enter') { e.preventDefault(); handleLike(); }
      if (e.key === 'f') { e.preventDefault(); toggleFullscreen(); }
      if (e.key === 'F11') { e.preventDefault(); toggleFullscreen(); }
      if (e.key === 'i') { e.preventDefault(); setShowInfo(s => !s); }
      if (e.key === 't' || e.key === 'T') setAddingTag(true);
      if (e.key === 'Delete') { e.preventDefault(); handleDelete(); }
      if (e.key === 'Escape') { setFullscreen(false); setEditingTitle(false); setAddingTag(false); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [goPrevItem, goNextItem, id, navigateToItem, folderSiblings, toggleFullscreen, setFullscreen, item]);

  useEffect(() => {
    if (!showInfo || !item) return;
    setFileStatus(null);
    fetch(`${mediaUrl()}/status`) // still hits server for raw status
      .then(r => r.json()).then(setFileStatus).catch(() => setFileStatus({ ok: false, error: 'Could not check status' }));
  }, [showInfo, item]);

  const mediaUrl = () => item ? getMediaUrl(item) : '';
  const isImage = item?.type === MEDIA_TYPE.IMAGE;
  const canGoPrev = playlist.ids.length > 1 || (() => { const idx = folderSiblings.findIndex(m => m.id === Number(id)); return idx > 0; })();
  const canGoNext = playlist.ids.length > 1 || (() => { const idx = folderSiblings.findIndex(m => m.id === Number(id)); return idx >= 0 && idx < folderSiblings.length - 1; })();

  const handleLike = async () => {
    if (!item) return;
    const nextLikes = (item.likes || 0) + 1;
    setItem(p => ({ ...p, likes: nextLikes }));
    if (fullscreen) setLikeFlash({ count: nextLikes, key: Date.now() });
    try { await likeMedia(item.id); bump(); } catch { setItem(p => ({ ...p, likes: Math.max(0, (p.likes || 0) - 1) })); }
  };

  const handleDelete = async () => {
    if (!item) return;
    if (Platform.OS === 'web' && !confirm(`Delete "${item.title}"?`)) return;
    try {
      await deleteMedia(item.id);
      bump();
      router.replace('/');
    } catch (err) {
      dispatch({ type: act.TOAST_SHOWN, message: 'Could not delete media', toastType: 'error' });
    }
  };

  const handleSetFolderThumbnail = async (time = null) => {
    if (!item || !folder?.id) return;
    try {
      await setFolderThumbnail(folder.id, item.id, time);
      bump();
    } catch (err) {
      console.error('Failed to set folder thumbnail:', err);
    }
  };

  const handleSetVideoThumbnail = async () => {
    if (!item || item.type === MEDIA_TYPE.IMAGE) return;
    const time = playerRef.current?.getCurrentTime() ?? 0;
    try {
      await setVideoThumbnail(item.id, time);
      setItem(prev => prev ? { ...prev, thumbnail_time: time } : prev);
      bump();
    } catch (err) {
      console.error('Failed to set video thumbnail:', err);
    }
  };

  const commitTitle = async () => {
    const trimmed = titleDraft.trim();
    setEditingTitle(false);
    if (!trimmed || trimmed === item?.title) return;
    setItem(p => ({ ...p, title: trimmed }));
    try { await renameMedia(item.id, trimmed); } catch { setItem(p => ({ ...p, title: item.title })); }
  };

  const handleRemoveTag = async (tag) => {
    if (!item) return;
    const orig = safeTags(item.tags);
    const next = orig.filter(t => t !== tag);
    setItem(p => ({ ...p, tags: next }));
    try { await updateMediaTags(item.id, next); } catch { setItem(p => ({ ...p, tags: orig })); }
  };

  const addTag = async (tag) => {
    if (!tag || safeTags(item?.tags).includes(tag)) return;
    const orig = safeTags(item.tags);
    const next = [...orig, tag];
    setItem(p => ({ ...p, tags: next }));
    try { await updateMediaTags(item.id, next); } catch { setItem(p => ({ ...p, tags: orig })); }
  };

  useEffect(() => {
    if (!addingTag) { setTagSuggestions([]); setSuggestionIndex(-1); return; }
    fetchTags().then(data => setAllTags(data.map(t => t.tag))).catch(() => {});
    const trimmed = tagDraft.trim().toLowerCase();
    if (!trimmed) { setTagSuggestions([]); return; }
    const existing = new Set(safeTags(item?.tags));
    setTagSuggestions(allTags.filter(t => t.toLowerCase().includes(trimmed) && !existing.has(t)).slice(0, 6));
  }, [addingTag, tagDraft]);

  if (loading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}><Loader /></View>;
  if (!item) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}><Text style={{ color: colors.textMut }}>Media not found</Text></View>;

  return (
    <View style={{ flex: 1, backgroundColor: fullscreen ? '#000' : colors.bg }}>
      {!fullscreen && (
        <View style={{ padding: 8, backgroundColor: colors.bg, borderBottomWidth: 1, borderColor: colors.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.gap }}>
            <IconButton icon={<Icon name="prev" size="sm" />} onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/'); }} label="Back" />
            <View style={{ flex: 1 }}>
              <Breadcrumbs items={breadcrumbs} />
            </View>
            <IconButton icon={<Icon name={fullscreen ? 'minimize' : 'maximize'} size="md" />} onPress={toggleFullscreen} label="Fullscreen" variant="overlay" />
          </View>
        </View>
      )}

      <View id="viewer" {...panResponder.panHandlers} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', overflow: 'hidden', position: 'relative' }}>
        {isImage ? (
          <ImageViewer src={mediaUrl()} alt={item.title} />
        ) : item.status === MEDIA_STATUS.ERROR ? (
          <View style={{ alignItems: 'center', gap: 10, padding: 32 }}>
            <Text style={{ color: '#dc322f', fontWeight: '500' }}>Processing failed</Text>
            <Text style={{ color: colors.textMut, fontSize: fontSize.xs }}>{item.path}</Text>
          </View>
        ) : item.status !== MEDIA_STATUS.READY ? (
          <View style={{ alignItems: 'center', gap: space.gap }}>
            <ProgressBar value={progressSecs && item.duration ? Math.min(99, Math.round((progressSecs / item.duration) * 100)) : 0} width={20} showPct={false} indeterminate={!progressSecs} />
            <Text style={{ color: colors.textEm, fontWeight: '500' }}>{item.status === 'transcoding' ? 'Transcoding…' : 'Processing…'}</Text>
          </View>
        ) : (
          <MediaPlayer ref={playerRef} src={mediaUrl()} title={item.title} />
        )}
        {canGoPrev && (
          <View style={{ position: 'absolute', left: 8, top: 0, bottom: 0, justifyContent: 'center' }}>
            <IconButton icon={<Icon name="prev" size="md" />} onPress={goPrevItem} label="Previous" variant="overlay" />
          </View>
        )}
        {canGoNext && (
          <View style={{ position: 'absolute', right: 8, top: 0, bottom: 0, justifyContent: 'center' }}>
            <IconButton icon={<Icon name="next" size="md" />} onPress={goNextItem} label="Next" variant="overlay" />
          </View>
        )}
        {fullscreen && likeFlash && (
          <LikeFlash key={likeFlash.key} count={likeFlash.count} onDone={() => setLikeFlash(null)} />
        )}
      </View>

      {!fullscreen && (
        <View style={{ backgroundColor: colors.bg, borderTopWidth: 1, borderColor: colors.border, padding: space.gap }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space.gap }}>
            <View style={{ flex: 1 }}>
              {editingTitle ? (
                <TextInput style={{ height: 28, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.accent, color: colors.textEm, fontSize: 22, fontWeight: '600', lineHeight: 28, fontFamily: fontFamily.mono, paddingHorizontal: 4, paddingVertical: 0 }} value={titleDraft} onChangeText={setTitleDraft} onBlur={commitTitle} onSubmitEditing={commitTitle} autoFocus selectTextOnFocus />
              ) : (
                <Text style={{ color: colors.textEm, fontWeight: '600', fontSize: 22, lineHeight: 28 }} onPress={() => { setTitleDraft(item.title); setEditingTitle(true); }} numberOfLines={1}>{item.title}</Text>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {item?.tags && safeTags(item.tags).map(tag => (
                  <Tag key={tag} label={tag} onPress={() => router.push(`/tags/${encodeURIComponent(tag)}`)} onRemove={() => handleRemoveTag(tag)} />
                ))}
                {addingTag ? (
                  <View style={{ position: 'relative', flexDirection: 'row', alignItems: 'center' }}>
                    <TextInput
                      style={{ height: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.accent, color: colors.textEm, fontSize: fontSize.xs, paddingHorizontal: 6, paddingVertical: 0, width: 96, fontFamily: fontFamily.mono }}
                      value={tagDraft}
                      onChangeText={setTagDraft}
                      onBlur={() => { setAddingTag(false); setTagDraft(''); setSuggestionIndex(-1); }}
                      onKeyPress={(e) => {
                        if (e.nativeEvent.key === 'ArrowDown') { e.preventDefault(); setSuggestionIndex(i => Math.min(i + 1, tagSuggestions.length - 1)); }
                        if (e.nativeEvent.key === 'ArrowUp') { e.preventDefault(); setSuggestionIndex(i => Math.max(i - 1, -1)); }
                        if (e.nativeEvent.key === 'Enter' || e.nativeEvent.key === ',') {
                          e.preventDefault();
                          if (suggestionIndex >= 0 && tagSuggestions[suggestionIndex]) {
                            addTag(tagSuggestions[suggestionIndex]);
                            setAddingTag(false); setTagDraft(''); setSuggestionIndex(-1);
                          } else {
                            setAddingTag(false); setTagDraft(''); addTag(tagDraft.trim());
                          }
                        }
                        if (e.nativeEvent.key === 'Escape') { e.preventDefault(); setAddingTag(false); setTagDraft(''); setSuggestionIndex(-1); }
                      }}
                      autoFocus
                      placeholder="tag name"
                    />
                    {tagSuggestions.length > 0 && (
                      <View style={{ position: 'absolute', bottom: '100%', left: 0, zIndex: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                        {tagSuggestions.map((t, i) => (
                          <Pressable
                            key={t}
                            onPressIn={() => { addTag(t); setAddingTag(false); setTagDraft(''); setSuggestionIndex(-1); }}
                            style={{ paddingHorizontal: 8, paddingVertical: 4, backgroundColor: i === suggestionIndex ? colors.accentBg : 'transparent' }}
                          >
                            <Text style={{ color: i === suggestionIndex ? colors.textEm : colors.textMut, fontSize: fontSize.xs, fontFamily: fontFamily.mono }}>{t}</Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </View>
                ) : (
                  <Tag label="+ tag" muted onPress={() => setAddingTag(true)} />
                )}
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.gap, flexShrink: 0 }}>
              <Button variant="ghost" size="sm" icon={<Icon name={item.likes > 0 ? 'heart-filled' : 'heart'} size="sm" color={item.likes > 0 ? colors.accent : undefined} />} onPress={handleLike}>{item.likes > 0 ? String(item.likes) : 'Like'}</Button>
              <Button variant="ghost" size="sm" icon={<Icon name="info" size="sm" />} onPress={() => setShowInfo(true)}>Info</Button>
              <Button variant="ghost" size="sm" icon={<Icon name="download" size="sm" />} onPress={() => downloadMedia(item)}>Download</Button>
              {isImage && folder?.id && (
                <Button variant="ghost" size="sm" icon={<Icon name="image" size="sm" />} onPress={() => handleSetFolderThumbnail()}>Use as folder thumbnail</Button>
              )}
              {!isImage && folder?.id && item.status === MEDIA_STATUS.READY && (
                <Button variant="ghost" size="sm" icon={<Icon name="video" size="sm" />} onPress={() => handleSetFolderThumbnail(playerRef.current?.getCurrentTime())}>Use frame for folder</Button>
              )}
              {!isImage && item.status === MEDIA_STATUS.READY && (
                <Button variant="ghost" size="sm" icon={<Icon name="video" size="sm" />} onPress={handleSetVideoThumbnail}>Use frame for video</Button>
              )}
              <Button variant="danger" size="sm" icon={<Icon name="trash" size="sm" />} onPress={handleDelete}>Delete</Button>
            </View>
          </View>
        </View>
      )}

      <Modal open={showInfo} onClose={() => setShowInfo(false)} title="Media Info">
        <View style={{ gap: space.gap }}>
          {[['ID', item.id], ['Title', item.title], ['Type', item.type], ['Status', item.status], ['Path', item.path], ['Codec', item.codec], ['Width', item.width], ['Height', item.height], ['Duration', item.duration && `${Math.floor(item.duration / 60)}:${String(Math.floor(item.duration % 60)).padStart(2, '0')}`], ['Camera', item.camera], ['Size', item.size && `${(item.size / 1024 / 1024).toFixed(1)} MB`]].filter(([, v]) => v != null && v !== '').map(([label, value]) => (
            <View key={label} style={{ flexDirection: 'row', gap: 14, paddingVertical: 6, borderBottomWidth: 1, borderColor: colors.borderSoft }}>
              <Text style={{ color: colors.textMut, fontSize: fontSize.sm, minWidth: 80 }}>{label}</Text>
              <Text style={{ color: colors.textEm, fontSize: fontSize.sm, flex: 1 }}>{String(value)}</Text>
            </View>
          ))}
        </View>
      </Modal>
    </View>
  );
}

import { TextInput } from 'react-native';
