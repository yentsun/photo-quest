import { FlatList, View } from 'react-native';
import { useCallback, useMemo, useState } from 'react';
import { usePlaylist } from '../contexts/PlaylistContext';
import { space } from '../theme/tokens';
import MediaCard from './MediaCard';
import FolderCard from './FolderCard';

const CARD_MIN_WIDTH = 225;

export default function Grid({ folders, items, onMediaPress, onLike, header }) {
  const { set } = usePlaylist();
  const [containerWidth, setContainerWidth] = useState(0);

  const data = useMemo(() => [
    ...folders.map(f => ({ _kind: 'folder', key: `folder-${f.id}`, data: f })),
    ...items.map((m, i) => ({ _kind: 'media', key: `media-${m.id}`, data: m, index: i })),
  ], [folders, items]);

  const padLeft = space.gridPadLeft;
  const padRight = space.gridPadLeft + 16;
  const available = Math.max(CARD_MIN_WIDTH, containerWidth - padLeft - padRight);
  const cols = containerWidth > 0
    ? Math.max(1, Math.floor((available + space.gap) / (CARD_MIN_WIDTH + space.gap)))
    : 1;
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
      style={{ flex: 1 }}
      data={data}
      numColumns={cols}
      key={cols}
      keyExtractor={(item) => item.key}
      renderItem={renderItem}
      ListHeaderComponent={header}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
      windowSize={5}
      initialNumToRender={10}
      maxToRenderPerBatch={10}
      columnWrapperStyle={cols > 1 ? { gap: space.gap } : undefined}
      contentContainerStyle={{
        gap: space.gap,
        paddingTop: space.gap,
        paddingLeft: padLeft,
        paddingRight: padRight,
        paddingBottom: space.gap,
      }}
    />
  );
}
