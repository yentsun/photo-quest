import { Pressable, View, Text, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { getThumbUrl } from '../../services/api';
import { Icon } from '../ui';
import { colors, fontSize, fontFamily } from '../../theme/tokens';

export default function TagCard({ tag, count, previewMediaId, previewThumbnailTime }) {
  const router = useRouter();
  const thumbnailUrl = previewMediaId ? getThumbUrl(previewMediaId, previewThumbnailTime) : null;

  return (
    <Pressable
      onPress={() => router.push(`/tags/${encodeURIComponent(tag)}`)}
      style={({ hovered }) => ({
        borderWidth: 1, borderColor: hovered ? colors.textMut : colors.border,
        backgroundColor: colors.surface, overflow: 'hidden', flexDirection: 'column',
      })}
    >
      <View style={{ aspectRatio: 4 / 3, backgroundColor: colors.dim, position: 'relative', overflow: 'hidden' }}>
        {thumbnailUrl ? (
          <Image source={{ uri: thumbnailUrl }} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} resizeMode="cover" />
        ) : (
          <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="list" size="2xl" color={colors.textMut} />
          </View>
        )}
      </View>
      <View style={{ padding: 6, paddingHorizontal: 10, borderTopWidth: 1, borderColor: colors.border }}>
        <Text style={{ color: colors.textEm, fontSize: fontSize.sm, fontFamily: fontFamily.mono }} numberOfLines={1}>{tag}</Text>
        <Text style={{ color: colors.textMut, fontSize: fontSize.xs, marginTop: 1 }}>{count} item{count !== 1 ? 's' : ''}</Text>
      </View>
    </Pressable>
  );
}
