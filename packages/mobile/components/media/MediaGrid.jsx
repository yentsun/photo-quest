import { FlatList, View, Text } from 'react-native';
import MediaCard from './MediaCard';
import { gridColumns } from '../../theme/breakpoints';
import { useWindowDimensions } from 'react-native';
import { colors, fontSize } from '../../theme/tokens';

export default function MediaGrid({ items, onPress, onLike, showLikes, onEndReached, loading }) {
  const { width } = useWindowDimensions();
  const cols = gridColumns(width);
  const gap = 12;
  const cardWidth = (width - gap * (cols + 1)) / cols;

  return (
    <FlatList
      data={items}
      numColumns={cols}
      key={cols} /* force re-render on column change */
      keyExtractor={item => String(item.id)}
      columnWrapperStyle={cols > 1 ? { gap } : undefined}
      contentContainerStyle={{ gap, padding: gap }}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      renderItem={({ item }) => (
        <View style={{ width: cardWidth }}>
          <MediaCard media={item} onPress={onPress} onLike={onLike} showLikes={showLikes} />
        </View>
      )}
      ListFooterComponent={loading ? <Text style={{ textAlign: 'center', padding: 16, color: colors.textMut, fontSize: fontSize.sm }}>Loading…</Text> : null}
    />
  );
}
