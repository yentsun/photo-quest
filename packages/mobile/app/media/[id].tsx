import { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Dimensions } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMediaActions } from '../../hooks/useMediaActions';
import { useRefresh } from '../../contexts/RefreshContext';
import { MEDIA_TYPE, MEDIA_STATUS } from '@photo-quest/shared';
import { ImageViewer } from '../../components/media/ImageViewer';
import { MediaPlayer } from '../../components/media/MediaPlayer';
import { LikeButton } from '../../components/media/LikeButton';
import { EmptyState } from '../../components/layout/EmptyState';
import { Button, Icon, IconButton, Loader, Modal, Input } from '../../components/ui';
import { colors, spacing, fontSize, radius } from '../../components/ui/theme';
import { getStreamUrl, getImageUrl, fetchMediaById, fetchMedia } from '../../utils/api';

export default function MediaPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { likeMedia, deleteMedia } = useMediaActions();
  const { bump } = useRefresh();
  const playerRef = useRef<any>(null);

  const [item, setItem] = useState<any>(null);
  const [folderMedia, setFolderMedia] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [showControls, setShowControls] = useState(true);

  const mediaId = Number(id);
  const isImage = item?.type === MEDIA_TYPE.IMAGE;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const mediaItem = await fetchMediaById(mediaId);
        if (cancelled) return;
        setItem(mediaItem);
        setLoading(false);

        if (mediaItem.folder) {
          const { items } = await fetchMedia({ folder: mediaItem.folder, limit: 200 });
          if (!cancelled) setFolderMedia(items);
        }
      } catch {
        if (!cancelled) { setItem(null); setLoading(false); }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [mediaId]);

  const navItems = folderMedia;
  const currentIndex = navItems.findIndex((m: any) => m.id === mediaId);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < navItems.length - 1;

  const goTo = (idx: number) => {
    const m = navItems[idx];
    if (m) router.replace(`/media/${m.id}` as any);
  };

  const handleDelete = async () => {
    if (!item) return;
    try {
      await deleteMedia(item.id);
      if (hasNext) { goTo(currentIndex + 1); } else if (hasPrev) { goTo(currentIndex - 1); } else { router.back(); }
    } catch {}
  };

  const toggleControls = () => setShowControls((c) => !c);

  if (loading) return <Loader message="Loading media... " />;
  if (!item) return <EmptyState icon={<Icon name="warning" size={32} color={colors.red} />} title="Not found" description="This media item could not be found." />;

  const mediaSrc = isImage ? getImageUrl(item.id) : getStreamUrl(item.id);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {showControls && (
        <View style={styles.topBar}>
          <IconButton icon={<Icon name="prev" size={18} />} label="Back" onPress={() => router.back()} variant="overlay" />
          <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
          <IconButton icon={<Icon name="close" size={18} />} label="Close" onPress={() => router.back()} variant="overlay" />
        </View>
      )}

      <Pressable style={styles.viewer} onPress={toggleControls}>
        {isImage ? (
          <ImageViewer src={mediaSrc} alt={item.title} />
        ) : (
          <MediaPlayer ref={playerRef} src={mediaSrc} title={item.title} />
        )}
      </Pressable>

      {showControls && (
        <View style={styles.bottomBar}>
          <View style={styles.navGroup}>
            <IconButton icon={<Icon name="prev" size={18} />} label="Previous" disabled={!hasPrev} onPress={() => goTo(currentIndex - 1)} variant="overlay" />
            <Text style={styles.counter}>{currentIndex + 1} / {navItems.length}</Text>
            <IconButton icon={<Icon name="next" size={18} />} label="Next" disabled={!hasNext} onPress={() => goTo(currentIndex + 1)} variant="overlay" />
          </View>
          <View style={styles.actionGroup}>
            <LikeButton count={item.likes || 0} onLike={() => likeMedia(item)} size="md" />
            <IconButton icon={<Icon name="trash" size={18} />} label="Delete" onPress={handleDelete} variant="overlay" />
            <IconButton icon={<Icon name="info" size={18} />} label="Info" onPress={() => setShowInfo(true)} variant="overlay" />
          </View>
        </View>
      )}

      <Modal open={showInfo} onClose={() => setShowInfo(false)} title="Media Info">
        <View style={{ gap: spacing.sm }}>
          <InfoRow label="Title" value={item.title} />
          <InfoRow label="Type" value={item.type} />
          <InfoRow label="Status" value={item.status} />
          {item.duration ? <InfoRow label="Duration" value={`${Math.round(item.duration)}s`} /> : null}
          {item.width && item.height ? <InfoRow label="Resolution" value={`${item.width}x${item.height}`} /> : null}
          {item.codec ? <InfoRow label="Codec" value={item.codec} /> : null}
          {item.size ? <InfoRow label="Size" value={formatSize(item.size)} /> : null}
          {item.camera ? <InfoRow label="Camera" value={item.camera} /> : null}
          {item.date_taken ? <InfoRow label="Taken" value={item.date_taken} /> : null}
        </View>
      </Modal>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row' }}>
      <Text style={{ color: colors.fgDim, fontSize: fontSize.sm, fontFamily: 'monospace', width: 100 }}>{label}</Text>
      <Text style={{ color: colors.fg, fontSize: fontSize.sm, fontFamily: 'monospace', flex: 1 }}>{value}</Text>
    </View>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  title: { color: colors.white, fontSize: fontSize.md, fontFamily: 'monospace', flex: 1, textAlign: 'center' },
  viewer: { flex: 1 },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  navGroup: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  actionGroup: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  counter: { color: colors.fgDim, fontSize: fontSize.sm, fontFamily: 'monospace' },
});
