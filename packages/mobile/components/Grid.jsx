import { ScrollView, View } from 'react-native';
import { useCallback } from 'react';
import { usePlaylist } from '../contexts/PlaylistContext';
import { space } from '../theme/tokens';
import MediaCard from './MediaCard';
import FolderCard from './FolderCard';

export default function Grid({ folders, items, onMediaPress, onLike, header }) {
  const { set } = usePlaylist();

  const data = [
    ...folders.map(f => ({ _kind: 'folder', key: `folder-${f.id}`, data: f })),
    ...items.map((m, i) => ({ _kind: 'media', key: `media-${m.id}`, data: m, index: i })),
  ];

  const handleMediaPress = useCallback((item, index) => {
    set(items.map(i => i.id), index);
    onMediaPress?.(item);
  }, [items, onMediaPress, set]);

  return (
    <ScrollView style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.gap, paddingTop: space.gap, paddingRight: space.gridPadLeft, paddingBottom: space.gap, paddingLeft: space.gridPadLeft }}>
        <View style={{ width: '100%' }}>{header}</View>
        {data.map(item => {
          if (item._kind === 'folder') {
            return <FolderCard key={item.key} folder={item.data} />;
          }
          return <MediaCard key={item.key} media={item.data} onPress={() => handleMediaPress(item.data, item.index)} onLike={onLike} />;
        })}
      </View>
    </ScrollView>
  );
}
