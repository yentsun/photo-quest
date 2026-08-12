import { FlatList, View } from 'react-native';
import { useCallback, useState } from 'react';
import { usePlaylist } from '../contexts/PlaylistContext';
import { space } from '../theme/tokens';
import MediaCard from './MediaCard';
import FolderCard from './FolderCard';

export default function Grid({ folders, items, onMediaPress, onLike, header }) {
  const [containerWidth, setContainerWidth] = useState(0);
  const { set } = usePlaylist();
  const cols = Math.max(1, Math.floor((containerWidth - space.gap) / (space.cardWidth + space.gap))) || 3;

  const data = [
    ...folders.map(f => ({ _kind: 'folder', key: `folder-${f.id}`, data: f })),
    ...items.map((m, i) => ({ _kind: 'media', key: `media-${m.id}`, data: m, index: i })),
  ];

  const handleMediaPress = useCallback((item, index) => {
    set(items.map(i => i.id), index);
    onMediaPress?.(item);
  }, [items, onMediaPress, set]);

  return (
    <View style={{ flex: 1 }} onLayout={e => setContainerWidth(e.nativeEvent.layout.width)}>
      {containerWidth > 0 && (
        <FlatList
          data={data}
          numColumns={cols}
          key={cols}
          keyExtractor={d => d.key}
          columnWrapperStyle={cols > 1 ? { gap: space.gap } : undefined}
          contentContainerStyle={{ gap: space.gap, paddingTop: space.gap, paddingRight: space.gap, paddingBottom: space.gap, paddingLeft: space.gridPadLeft }}
          ListHeaderComponent={header}
          renderItem={({ item }) => {
            if (item._kind === 'folder') {
              return <FolderCard folder={item.data} />;
            }
            return <MediaCard media={item.data} onPress={() => handleMediaPress(item.data, item.index)} onLike={onLike} />;
          }}
        />
      )}
    </View>
  );
}
