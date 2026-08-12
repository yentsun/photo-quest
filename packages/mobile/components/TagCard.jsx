import { View, Text, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { getThumbUrl } from '../services/api';
import Card from './Card';
import Icon from './Icon';
import { colors, fontSize, fontFamily } from '../theme/tokens';

export default function TagCard({ tag, count, previewMediaId, previewThumbnailTime }) {
  const router = useRouter();
  const thumbnailUrl = previewMediaId ? getThumbUrl(previewMediaId, previewThumbnailTime) : null;

  return (
    <Card onPress={() => router.push(`/tags/${encodeURIComponent(tag)}`)}>
      <Card.ImageArea>
        {thumbnailUrl ? (
          <Image source={{ uri: thumbnailUrl }} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} resizeMode="cover" />
        ) : (
          <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="list" size="2xl" color={colors.textMut} />
          </View>
        )}
      </Card.ImageArea>
      <Card.Footer>
        <Text style={{ color: colors.textEm, fontSize: fontSize.sm, fontFamily: fontFamily.mono }} numberOfLines={1}>{tag}</Text>
        <Text style={{ color: colors.textMut, fontSize: fontSize.xs, marginTop: 1 }}>{count} item{count !== 1 ? 's' : ''}</Text>
      </Card.Footer>
    </Card>
  );
}
