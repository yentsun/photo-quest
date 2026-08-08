import { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { MEDIA_STATUS, MEDIA_TYPE } from '@photo-quest/shared';
import { getThumbUrl } from '../../utils/api';
import { Icon, ProgressBar, Badge } from '../ui';
import { colors, spacing, fontSize, radius } from '../ui/theme';
import { LikeButton } from './LikeButton';
import { useJobProgress } from '../../contexts/JobProgressContext';

interface MediaItem {
  id: number;
  title: string;
  type: string;
  status: string;
  duration: number;
  likes: number;
  thumbnail_time?: number;
  tags?: string[] | string;
  folder_chain?: any[];
}

interface MediaCardProps {
  media: MediaItem;
  onClick?: (media: MediaItem) => void;
  onLike?: (media: MediaItem) => void;
  showLikes?: boolean;
}

function parseTags(tags?: string[] | string): string[] {
  if (Array.isArray(tags)) return tags;
  if (typeof tags === 'string') {
    try { return JSON.parse(tags); } catch { return []; }
  }
  return [];
}

export function MediaCard({ media, onClick, onLike, showLikes = true }: MediaCardProps) {
  const isImage = media.type === MEDIA_TYPE.IMAGE;
  const [thumbFailed, setThumbFailed] = useState(false);
  const [thumbReady, setThumbReady] = useState(false);

  const progress = useJobProgress();
  const progressSecs = progress.progress.get(media.id) ?? null;
  const isTranscoding = media.status === MEDIA_STATUS.TRANSCODING || progressSecs !== null;
  const isPending = !isTranscoding && (media.status === MEDIA_STATUS.PENDING || media.status === MEDIA_STATUS.PROBED);
  const showOverlay = (isTranscoding || isPending) && !thumbReady;

  const pct = isTranscoding && progressSecs !== null && media.duration > 0
    ? Math.min(99, Math.round((progressSecs / media.duration) * 100))
    : null;

  const tags = parseTags(media.tags);

  return (
    <Pressable style={styles.card} onPress={() => onClick?.(media)}>
      <View style={styles.frame}>
        {thumbFailed ? (
          <View style={styles.placeholder}>
            <Icon name={isImage ? 'image' : 'video'} size={24} color={colors.fgDim} />
          </View>
        ) : (
          <Image
            source={{ uri: getThumbUrl(media.id, media.thumbnail_time) }}
            style={styles.thumb}
            contentFit="cover"
            onLoad={() => setThumbReady(true)}
            onError={() => setThumbFailed(true)}
          />
        )}

        {media.status === MEDIA_STATUS.ERROR ? (
          <View style={[styles.overlay, styles.errorOverlay]}>
            <Icon name="warning" size={20} color={colors.red} />
            <Text style={styles.overlayText}>Processing failed</Text>
          </View>
        ) : showOverlay ? (
          <View style={styles.overlay}>
            {isTranscoding && progressSecs !== null ? (
              <View style={styles.progressWrap}>
                <ProgressBar value={pct ?? 0} width={12} />
              </View>
            ) : (
              <Text style={styles.overlayText}>{isTranscoding ? 'Transcoding...' : 'Processing...'}</Text>
            )}
          </View>
        ) : null}

        <View style={styles.cornerBadge}>
          <Text style={styles.cornerText}>{isImage ? 'IMG' : 'VID'}</Text>
        </View>

        {tags.length > 0 && (
          <View style={styles.tags}>
            {tags.slice(0, 3).map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText} numberOfLines={1}>{tag}</Text>
              </View>
            ))}
          </View>
        )}

        {showLikes && (
          <View style={styles.likes}>
            <LikeButton count={media.likes || 0} onLike={() => onLike?.(media)} size="sm" />
          </View>
        )}
      </View>

      <View style={styles.meta}>
        <Text style={styles.title} numberOfLines={1}>{media.title}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    maxWidth: '50%',
    padding: 4,
  },
  frame: {
    aspectRatio: 16 / 10,
    backgroundColor: colors.bgHighlight,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgHighlight,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  errorOverlay: {
    backgroundColor: 'rgba(220,50,47,0.15)',
  },
  overlayText: {
    color: colors.fg,
    fontSize: fontSize.xs,
    fontFamily: 'monospace',
  },
  progressWrap: {
    paddingHorizontal: spacing.lg,
    width: '100%',
  },
  cornerBadge: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  cornerText: {
    color: colors.white,
    fontSize: 9,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  tags: {
    position: 'absolute',
    bottom: spacing.xs,
    left: spacing.xs,
    right: spacing.xs,
    flexDirection: 'row',
    gap: 4,
    flexWrap: 'wrap',
  },
  tag: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: radius.sm,
    maxWidth: 80,
  },
  tagText: {
    color: colors.fg,
    fontSize: 9,
    fontFamily: 'monospace',
  },
  likes: {
    position: 'absolute',
    bottom: spacing.xs,
    right: spacing.xs,
  },
  meta: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  title: {
    color: colors.fg,
    fontSize: fontSize.sm,
    fontFamily: 'monospace',
  },
});
