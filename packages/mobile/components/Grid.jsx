import { FlatList, View } from 'react-native';
import { useCallback } from 'react';
import { useWindowDimensions } from 'react-native';
import { usePlaylist } from '../contexts/PlaylistContext';
import { space } from '../theme/tokens';
import MediaCard from './MediaCard';
import FolderCard from './FolderCard';

const CARD_WIDTH = 200;

export default function Grid({ folders, items, onFolderPress, onFolderRemove, onMediaPress, onLike }) {
  const { width } = useWindowDimensions();
  const { set } = usePlaylist();
  const cols = Math.max(1, Math.floor((width - space.gap) / (CARD_WIDTH + space.gap)));

  const data = [
    ...folders.map(f => ({ _kind: 'folder', key: `folder-${f.id}`, data: f })),
    ...items.map((m, i) => ({ _kind: 'media', key: `media-${m.id}`, data: m, index: i })),
  ];

  const handleMediaPress = useCallback((item, index) => {
    set(items.map(i => i.id), index);
    onMediaPress?.(item);
  }, [items, onMediaPress, set]);

  return (
    <FlatList
      data={data}
      numColumns={cols}
      key={cols}
      keyExtractor={d => d.key}
      columnWrapperStyle={cols > 1 ? { gap: space.gap } : undefined}
      contentContainerStyle={{ gap: space.gap, padding: space.gap }}
      renderItem={({ item }) => {
        if (item._kind === 'folder') {
          return <FolderCard folder={item.data} onRemove={() => onFolderRemove?.(item.data)} />;
        }
        return <MediaCard media={item.data} onPress={() => handleMediaPress(item.data, item.index)} onLike={onLike} />;
      }}
    />
  );
}
