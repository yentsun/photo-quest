import { useState } from 'react';
import { View, Text, Image } from 'react-native';
import { MEDIA_TYPE } from '@photo-quest/shared';
import { getThumbUrl } from '../../services/api';
import { Card, Icon } from '../ui';
import LikeButton from './LikeButton';
import { useJobProgress } from '../../contexts/JobProgressContext';
import { colors, fontSize } from '../../theme/tokens';

export default function MediaCard({ media, onPress, onLike, showLikes = true }) {
  const isImage = media.type === MEDIA_TYPE.IMAGE;
  const [thumbFailed, setThumbFailed] = useState(false);
  const progressSecs = useJobProgress(media.id);

  const thumbSrc = getThumbUrl(media.id, media.thumbnail_time);

  const tags = (() => {
    if (Array.isArray(media.tags)) return media.tags;
    if (typeof media.tags === 'string') { try { return JSON.parse(media.tags); } catch { return []; } }
    return [];
  })();

  return (
    <Card onPress={() => onPress?.(media)}>
      <Card.ImageArea>
        {thumbFailed ? (
          <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={isImage ? 'image' : 'video'} size="xl" color={colors.textMut} />
          </View>
        ) : (
          <Image
            source={{ uri: thumbSrc }}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
            resizeMode="cover"
            onLoad={() => {}}
            onError={() => setThumbFailed(true)}
          />
        )}

        {media.status === 'error' && (
          <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Icon name="warning" size="lg" color={colors.accent} />
            <Text style={{ color: '#fff', fontSize: fontSize.xs }}>Processing failed</Text>
          </View>
        )}

        <View style={{ position: 'absolute', top: 6, left: 6, backgroundColor: colors.bg, paddingHorizontal: 4, paddingVertical: 1, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.textMut, fontSize: fontSize.xs, letterSpacing: 0.04 * fontSize.xs }}>{isImage ? 'IMG' : 'VID'}</Text>
        </View>

        {tags.length > 0 && (
          <View style={{ position: 'absolute', bottom: 0, left: 0, padding: 4, gap: 2 }}>
            {tags.slice(0, 3).map(tag => (
              <Text key={tag} style={{ fontSize: 10, color: '#fff', backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 3, paddingHorizontal: 5, paddingVertical: 2, overflow: 'hidden', maxWidth: 80 }} numberOfLines={1}>{tag}</Text>
            ))}
          </View>
        )}

        {showLikes && (
          <View style={{ position: 'absolute', bottom: 6, right: 6 }}>
            <LikeButton count={media.likes || 0} onLike={() => onLike?.(media)} size="sm" />
          </View>
        )}
      </Card.ImageArea>

      <Card.Footer>
        <Text style={{ fontSize: fontSize.sm, color: colors.textEm, flex: 1, overflow: 'hidden' }} numberOfLines={1}>{media.title}</Text>
      </Card.Footer>
    </Card>
  );
}
