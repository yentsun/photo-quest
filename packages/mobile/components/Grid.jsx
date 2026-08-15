import { FlatList, View } from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, usePathname } from 'expo-router';
import { usePlaylist } from '../contexts/PlaylistContext';
import { space } from '../theme/tokens';
import MediaCard from './MediaCard';
import FolderCard from './FolderCard';

const CARD_MIN_WIDTH = 225;
const gridScrollOffsets = new Map();

export default function Grid({ folders, items, onMediaPress, onLike, header }) {
  const { set } = usePlaylist();
  const pathname = usePathname();
  const listRef = useRef(null);
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
  const rowPitch = itemWidth * 0.75 + 46 + space.gap;

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

  const handleScroll = useCallback((e) => {
    gridScrollOffsets.set(pathname, e.nativeEvent.contentOffset.y);
  }, [pathname]);

  const restoreScroll = useCallback(() => {
    const saved = gridScrollOffsets.get(pathname);
    if (saved == null || saved <= 0) return;
    const attempt = (n) => {
      listRef.current?.scrollToOffset({ offset: saved, animated: false });
      if (n < 3) setTimeout(() => attempt(n + 1), 100);
    };
    requestAnimationFrame(() => attempt(0));
  }, [pathname]);

  useFocusEffect(useCallback(() => {
    restoreScroll();
  }, [restoreScroll]));

  useEffect(() => {
    restoreScroll();
  }, [cols, restoreScroll]);

  return (
    <FlatList
      ref={listRef}
      style={{ flex: 1 }}
      data={data}
      numColumns={cols}
      key={cols}
      keyExtractor={(item) => item.key}
      renderItem={renderItem}
      ListHeaderComponent={header}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
      getItemLayout={(data, index) => ({ length: rowPitch, offset: rowPitch * index, index })}
      onScroll={handleScroll}
      scrollEventThrottle={16}
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
