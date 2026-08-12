import { FlatList, Text } from 'react-native';
import { useCallback } from 'react';
import MediaCard from './MediaCard';
import { useWindowDimensions } from 'react-native';
import { usePlaylist } from '../contexts/PlaylistContext';
import { colors, fontSize, space } from '../theme/tokens';

const CARD_WIDTH = 200;

export default function MediaGrid({ items, onPress, onLike, showLikes, onEndReached, loading, nestedScroll }) {
  const { width } = useWindowDimensions();
  const { set } = usePlaylist();
  const cols = Math.max(1, Math.floor((width - space.gap) / (CARD_WIDTH + space.gap)));

  const handlePress = useCallback((item, index) => {
    set(items.map(i => i.id), index);
    onPress?.(item);
  }, [items, onPress, set]);

  return (
    <FlatList
      data={items}
      numColumns={cols}
      key={cols}
      keyExtractor={item => String(item.id)}
      columnWrapperStyle={cols > 1 ? { gap: space.gap } : undefined}
      contentContainerStyle={{ gap: space.gap, padding: space.gap }}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      scrollEnabled={!nestedScroll}
      renderItem={({ item, index }) => (
        <MediaCard media={item} onPress={() => handlePress(item, index)} onLike={onLike} showLikes={showLikes} />
      )}
      ListFooterComponent={loading ? <Text style={{ textAlign: 'center', padding: 16, color: colors.textMut, fontSize: fontSize.sm }}>Loading…</Text> : null}
    />
  );
}
