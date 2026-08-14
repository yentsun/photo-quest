import { FlatList, View, useWindowDimensions } from 'react-native';
import { useCallback, useMemo } from 'react';
import { usePlaylist } from '../contexts/PlaylistContext';
import { space } from '../theme/tokens';
import MediaCard from './MediaCard';
import FolderCard from './FolderCard';

const CARD_MIN_WIDTH = 225;

export default function Grid({ folders, items, onMediaPress, onLike, header }) {
  const { set } = usePlaylist();
  const { width } = useWindowDimensions();

  const data = useMemo(() => [
    ...folders.map(f => ({ _kind: 'folder', key: `folder-${f.id}`, data: f })),
    ...items.map((m, i) => ({ _kind: 'media', key: `media-${m.id}`, data: m, index: i })),
  ], [folders, items]);

  const cols = Math.max(1, Math.floor((width - space.gridPadLeft * 2 + space.gap) / (CARD_MIN_WIDTH + space.gap)));
  const available = Math.max(CARD_MIN_WIDTH, width - space.gridPadLeft * 2);
  const itemWidth = cols > 1 ? (available - space.gap * (cols - 1)) / cols : available;

  const handleMediaPress = useCallback((item, index) => {
    set(items.map(i => i.id), index);
    onMediaPress?.(item);
  }, [items, onMediaPress, set]);

  const renderItem = useCallback(({ item }) => {
    if (item._kind === 'folder') {
      return <View style={{ width: itemWidth }}><FolderCard folder={item.data} /></View>;
    }
    return (
      <View style={{ width: itemWidth }}>
        <MediaCard media={item.data} onPress={() => handleMediaPress(item.data, item.index)} onLike={onLike} />
      </View>
    );
  }, [itemWidth, handleMediaPress, onLike]);

  return (
    <FlatList
      data={data}
      numColumns={cols}
      key={cols}
      keyExtractor={(item) => item.key}
      renderItem={renderItem}
      ListHeaderComponent={header}
      columnWrapperStyle={cols > 1 ? { gap: space.gap } : undefined}
      contentContainerStyle={{
        gap: space.gap,
        paddingTop: space.gap,
        paddingHorizontal: space.gridPadLeft,
        paddingBottom: space.gap,
      }}
    />
  );
}
