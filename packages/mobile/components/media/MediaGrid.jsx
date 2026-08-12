import { FlatList, View, Text } from 'react-native';
import { useCallback } from 'react';
import MediaCard from './MediaCard';
import { gridColumns } from '../../theme/breakpoints';
import { useWindowDimensions } from 'react-native';
import { usePlaylist } from '../../contexts/PlaylistContext';
import { colors, fontSize } from '../../theme/tokens';

export default function MediaGrid({ items, onPress, onLike, showLikes, onEndReached, loading, nestedScroll }) {
  const { width } = useWindowDimensions();
  const cols = gridColumns(width);
  const gap = 12;
  const cardWidth = (width - gap * (cols + 1)) / cols;
  const { set } = usePlaylist();

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
      columnWrapperStyle={cols > 1 ? { gap } : undefined}
      contentContainerStyle={{ gap, padding: gap }}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      scrollEnabled={!nestedScroll}
      renderItem={({ item, index }) => (
        <View style={{ width: cardWidth }}>
          <MediaCard media={item} onPress={() => handlePress(item, index)} onLike={onLike} showLikes={showLikes} />
        </View>
      )}
      ListFooterComponent={loading ? <Text style={{ textAlign: 'center', padding: 16, color: colors.textMut, fontSize: fontSize.sm }}>Loading…</Text> : null}
    />
  );
}
