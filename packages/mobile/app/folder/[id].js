import { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, FlatList } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMediaActions } from '../../hooks/useMedia';
import { useRefresh } from '../../contexts/RefreshContext';
import { fetchMedia, getLastFolders, fetchFoldersForParent } from '../../services/api';
import MediaGrid from '../../components/MediaGrid';
import FolderCard from '../../components/FolderCard';
import EmptyState from '../../components/EmptyState';
import Button from '../../components/Button';
import Icon from '../../components/Icon';
import Loader from '../../components/Loader';
import Select from '../../components/Select';
import { colors, fontSize, fontFamily, space } from '../../theme/tokens';
import { useBreakpoint } from '../../theme/breakpoints';

export default function FolderPage() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { likeMedia } = useMediaActions();
  const { signal } = useRefresh();
  const folderId = Number(id);

  const [folders, setFolders] = useState([]);
  const [folderChain, setFolderChain] = useState([]);
  const [directMedia, setDirectMedia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState('filename');

  const folder = folderChain.find(f => f.id === folderId) ?? null;
  const subfolders = folders.filter(f => f.parentId === folderId);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const { items: allFolders, chain } = await fetchFoldersForParent(folderId);
        if (cancelled) return;
        setFolders(allFolders);
        setFolderChain(chain);
        const found = chain.find(f => f.id === folderId) ?? allFolders.find(f => f.id === folderId);
        if (found) {
          const { items } = await fetchMedia({ folder: found.path, limit: 10000, sort });
          if (!cancelled) setDirectMedia(items);
        }
      } catch (err) { console.error(err); }
      if (!cancelled) setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [folderId, signal, sort]);

  const breadcrumbs = folderChain.map((crumb) => ({
    id: crumb.id,
    name: crumb.path.split(/[/\\]/).filter(Boolean).pop() || 'Folder',
  }));

  if (loading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}><Loader message="Loading folder…" /></View>;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg, padding: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 16 }}>
        <Button variant="text" onPress={() => router.push('/')}>Library</Button>
        {breadcrumbs.map((crumb, i) => (
          <View key={crumb.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{ color: colors.border, fontSize: fontSize.sm }}>/</Text>
            <Button variant="text" onPress={() => router.push(`/folder/${crumb.id}`)}>{crumb.name}</Button>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <View>
          <Text style={{ fontSize: fontSize.xl, fontWeight: '700', color: colors.textEm }}>{folder?.name || breadcrumbs[breadcrumbs.length - 1]?.name || 'Folder'}</Text>
          <Text style={{ color: colors.textMut, fontSize: fontSize.sm }}>{directMedia.length} items</Text>
        </View>
        <Select
          value={sort}
          onChange={setSort}
          options={[{ value: 'filename', label: 'Name' }, { value: 'date', label: 'Date' }]}
        />
      </View>

      {subfolders.length > 0 && (
        <View style={{ flexDirection: 'row', gap: space.gap, flexWrap: 'wrap', marginBottom: 24 }}>
          {subfolders.map(f => (
            <FolderCard key={f.id} folder={f} />
          ))}
        </View>
      )}

      {directMedia.length > 0 ? (
        <MediaGrid items={directMedia} onPress={item => router.push(`/media/${item.id}`)} onLike={likeMedia} />
      ) : (
        <EmptyState icon={<Icon name="folder" size="2xl" />} title="Empty folder" description="This folder contains no media yet." />
      )}
    </ScrollView>
  );
}
