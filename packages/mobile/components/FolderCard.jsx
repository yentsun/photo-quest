import { View, Text, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { getThumbUrl } from '../services/api';
import Card from './Card';
import Icon from './Icon';
import { colors, fontSize, fontFamily } from '../theme/tokens';

export default function FolderCard({ folder }) {
  const router = useRouter();
  const pathName = folder.path.split(/[/\\]/).filter(Boolean).pop() || 'Folder';
  const displayName = folder.name || pathName;
  const thumbnailUrl = folder.previewMediaId ? getThumbUrl(folder.previewMediaId, folder.thumbnailTime) : null;
  const imageCount = folder.subtreeImageCount ?? folder.imageCount ?? 0;
  const videoCount = folder.subtreeVideoCount ?? folder.videoCount ?? 0;

  return (
    <Card onPress={() => router.push(`/folder/${folder.id}`)}>
      <Card.ImageArea>
        {thumbnailUrl ? (
          <Image source={{ uri: thumbnailUrl }} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} resizeMode="cover" />
        ) : (
          <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="folder" size="2xl" color={colors.textMut} />
          </View>
        )}
      </Card.ImageArea>
      <Card.Footer>
        <Text style={{ color: colors.textEm, fontSize: fontSize.sm, fontFamily: fontFamily.mono }} numberOfLines={1}>{displayName}</Text>
        {(imageCount > 0 || videoCount > 0) && (
          <Text style={{ color: colors.textMut, fontSize: fontSize.xs, marginTop: 1 }}>
            {imageCount > 0 && `${imageCount} image${imageCount !== 1 ? 's' : ''}`}
            {imageCount > 0 && videoCount > 0 && ', '}
            {videoCount > 0 && `${videoCount} video${videoCount !== 1 ? 's' : ''}`}
          </Text>
        )}
      </Card.Footer>
    </Card>
  );
}
