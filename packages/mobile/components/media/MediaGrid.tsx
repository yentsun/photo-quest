import { useCallback } from 'react';
import { FlatList, StyleSheet, type ListRenderItem } from 'react-native';
import { MediaCard } from './MediaCard';
import { colors } from '../ui/theme';

interface MediaItem {
  id: number;
  title: string;
  type: string;
  status: string;
  duration: number;
  likes: number;
  thumbnail_time?: number;
  tags?: string[] | string;
}

interface MediaGridProps {
  items: MediaItem[];
  onItemClick?: (media: MediaItem) => void;
  onItemLike?: (media: MediaItem) => void;
  onNearEnd?: () => void;
  emptyState?: React.ReactNode;
  numColumns?: number;
}

export function MediaGrid({ items = [], onItemClick, onItemLike, onNearEnd, emptyState, numColumns = 2 }: MediaGridProps) {
  const renderItem: ListRenderItem<MediaItem> = useCallback(
    ({ item }) => (
      <MediaCard media={item} onClick={onItemClick} onLike={onItemLike} />
    ),
    [onItemClick, onItemLike]
  );

  if (items.length === 0 && emptyState) return <>{emptyState}</>;

  return (
    <FlatList
      data={items}
      renderItem={renderItem}
      keyExtractor={(item) => String(item.id)}
      numColumns={numColumns}
      onEndReached={onNearEnd}
      onEndReachedThreshold={0.5}
      contentContainerStyle={styles.list}
      style={styles.container}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  list: {
    padding: 4,
  },
});
