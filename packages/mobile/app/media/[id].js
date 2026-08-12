import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { View, Text, Pressable, Platform, PanResponder } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMediaActions } from '../../hooks/useMedia';
import { useRefresh } from '../../contexts/RefreshContext';
import { useGlobal } from '../../contexts/GlobalContext';
import { usePlaylist } from '../../contexts/PlaylistContext';
import { MEDIA_TYPE, MEDIA_STATUS, actions as act } from '@photo-quest/shared';
import ImageViewer from '../../components/ImageViewer';
import MediaPlayer from '../../components/MediaPlayer';
import Button from '../../components/Button';
import Icon from '../../components/Icon';
import IconButton from '../../components/IconButton';
import Modal from '../../components/Modal';
import ProgressBar from '../../components/ProgressBar';
import { getMediaUrl, fetchMediaById, fetchTags, likeMedia, downloadMedia, renameMedia, updateMediaTags, deleteMedia } from '../../services/api';
import { useJobProgress } from '../../contexts/JobProgressContext';
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

  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const playerRef = useRef(null);
  const [showInfo, setShowInfo] = useState(false);
  const [fileStatus, setFileStatus] = useState(null);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [addingTag, setAddingTag] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const [allTags, setAllTags] = useState([]);

  const progressSecs = useJobProgress(item?.id);

  const navigateToItem = useCallback((targetId) => {
    if (!targetId) return;
    router.replace(`/media/${targetId}`);
  }, [router]);

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 20 && Math.abs(gs.dx) > Math.abs(gs.dy),
    onPanResponderRelease: (_, gs) => {
      if (gs.dx > 80 && playlist.ids.length > 1) {
        goPrev();
        const prevId = playlist.ids[(playlist.index - 1 + playlist.ids.length) % playlist.ids.length];
        if (prevId && prevId !== Number(id)) navigateToItem(prevId);
      } else if (gs.dx < -80 && playlist.ids.length > 1) {
        goNext();
        const nextId = playlist.ids[(playlist.index + 1) % playlist.ids.length];
        if (nextId && nextId !== Number(id)) navigateToItem(nextId);
      }
    },
  }), [playlist, goNext, goPrev, id, navigateToItem]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const mediaItem = await fetchMediaById(Number(id));
        if (cancelled) return;
        setItem(mediaItem);
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
      if (e.key === 'f') setIsFullscreen(fs => !fs);
      if (e.key === 'i') setShowInfo(s => !s);
      if (e.key === 't' || e.key === 'T') setAddingTag(true);
      if (e.key === 'ArrowLeft' && playlist.ids.length > 1) { goPrev(); const prevId = playlist.ids[(playlist.index - 1 + playlist.ids.length) % playlist.ids.length]; if (prevId && prevId !== Number(id)) navigateToItem(prevId); }
      if (e.key === 'ArrowRight' && playlist.ids.length > 1) { goNext(); const nextId = playlist.ids[(playlist.index + 1) % playlist.ids.length]; if (nextId && nextId !== Number(id)) navigateToItem(nextId); }
      if (e.key === 'Escape') { setIsFullscreen(false); setEditingTitle(false); setAddingTag(false); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [playlist, goNext, goPrev, id, navigateToItem]);

  useEffect(() => {
    if (!showInfo || !item) return;
    setFileStatus(null);
    fetch(`${mediaUrl()}/status`) // still hits server for raw status
      .then(r => r.json()).then(setFileStatus).catch(() => setFileStatus({ ok: false, error: 'Could not check status' }));
  }, [showInfo, item]);

  const mediaUrl = () => item ? getMediaUrl(item) : '';
  const isImage = item?.type === MEDIA_TYPE.IMAGE;

  const handleLike = async () => {
    if (!item) return;
    const orig = item.likes || 0;
    setItem(p => ({ ...p, likes: orig + 1 }));
    try { await likeMedia(item.id); bump(); } catch { setItem(p => ({ ...p, likes: orig })); }
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
    if (!addingTag) return;
    fetchTags().then(data => setAllTags(data.map(t => t.tag))).catch(() => {});
  }, [addingTag]);

  if (loading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}><Text style={{ color: colors.textMut }}>Loading…</Text></View>;
  if (!item) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}><Text style={{ color: colors.textMut }}>Media not found</Text></View>;

  return (
    <View style={{ flex: 1, backgroundColor: isFullscreen ? '#000' : colors.bg }}>
      {!isFullscreen && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, backgroundColor: colors.bg, borderBottomWidth: 1, borderColor: colors.border }}>
          <IconButton icon={<Icon name="prev" size="sm" />} onPress={() => router.back()} label="Back" />
          <Text style={{ flex: 1, fontSize: fontSize.sm, color: colors.textEm }} numberOfLines={1}>{item.title}</Text>
          <IconButton icon={<Icon name={isFullscreen ? 'minimize' : 'maximize'} size="md" />} onPress={() => { if (Platform.OS === 'web') { document.fullscreenElement ? document.exitFullscreen() : document.getElementById('viewer')?.requestFullscreen(); } }} label="Fullscreen" variant="overlay" />
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
      </View>

      {!isFullscreen && (
        <View style={{ backgroundColor: colors.bg, borderTopWidth: 1, borderColor: colors.border, padding: space.gap, position: 'relative' }}>
          {editingTitle ? (
            <TextInput style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.accent, color: colors.textEm, fontSize: fontSize.base, fontFamily: fontFamily.mono, padding: 4, height: 24 }} value={titleDraft} onChangeText={setTitleDraft} onBlur={commitTitle} onSubmitEditing={commitTitle} autoFocus selectTextOnFocus />
          ) : (
            <Text style={{ color: colors.textEm, fontWeight: '500', fontSize: fontSize.base }} onPress={() => { setTitleDraft(item.title); setEditingTitle(true); }} numberOfLines={1}>{item.title}</Text>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
            {item?.tags && safeTags(item.tags).map(tag => (
              <View key={tag} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                <Pressable onPress={() => router.push(`/tags/${encodeURIComponent(tag)}`)}>
                  <Text style={{ fontSize: fontSize.xs, color: colors.text }}>{tag}</Text>
                </Pressable>
                <Pressable onPress={() => handleRemoveTag(tag)}>
                  <Text style={{ color: colors.textMut, fontSize: 14 }}>×</Text>
                </Pressable>
              </View>
            ))}
            {addingTag ? (
              <TextInput
                style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.accent, color: colors.textEm, fontSize: fontSize.xs, paddingHorizontal: 8, paddingVertical: 1, width: 96, fontFamily: fontFamily.mono }}
                value={tagDraft}
                onChangeText={setTagDraft}
                onBlur={() => { setAddingTag(false); setTagDraft(''); addTag(tagDraft.trim()); }}
                onSubmitEditing={() => { setAddingTag(false); setTagDraft(''); addTag(tagDraft.trim()); }}
                autoFocus
                placeholder="tag name"
              />
            ) : (
              <Pressable onPress={() => setAddingTag(true)} style={{ paddingHorizontal: 8, paddingVertical: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ color: colors.textMut, fontSize: fontSize.xs, fontFamily: fontFamily.mono }}>+ tag</Text>
              </Pressable>
            )}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <Button variant="ghost" size="sm" icon={<Icon name="info" size="sm" />} onPress={() => setShowInfo(true)}>Info</Button>
            <Button variant="ghost" size="sm" icon={<Icon name="download" size="sm" />} onPress={() => downloadMedia(item)}>Download</Button>
            <Button variant="danger" size="sm" icon={<Icon name="trash" size="sm" />} onPress={handleDelete}>Delete</Button>
          </View>
        </View>
      )}

      <Modal open={showInfo} onClose={() => setShowInfo(false)} title="Media Info">
        <View style={{ gap: 8 }}>
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
