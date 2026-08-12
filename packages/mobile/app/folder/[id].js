import { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMediaActions } from '../../hooks/useMedia';
import { useRefresh } from '../../contexts/RefreshContext';
import { fetchMedia, fetchFoldersForParent } from '../../services/api';
import Grid from '../../components/Grid';
import EmptyState from '../../components/EmptyState';
import Button from '../../components/Button';
import Icon from '../../components/Icon';
import Loader from '../../components/Loader';
import Select from '../../components/Select';
import { colors, fontSize, space } from '../../theme/tokens';

export default function FolderPage() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { likeMedia } = useMediaActions();
  const { signal } = useRefresh();
  const folderId = Number(id);

  const [allFolders, setAllFolders] = useState([]);
  const [folderChain, setFolderChain] = useState([]);
  const [mediaItems, setMediaItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState('filename');

  const folder = folderChain.find(f => f.id === folderId) ?? null;
  const subfolders = allFolders.filter(f => f.parentId === folderId);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const { items: folders, chain } = await fetchFoldersForParent(folderId);
        if (cancelled) return;
        setAllFolders(folders);
        setFolderChain(chain);
        const found = chain.find(f => f.id === folderId) ?? folders.find(f => f.id === folderId);
        if (found) {
          const { items } = await fetchMedia({ folder: found.path, limit: 10000, sort });
          if (!cancelled) setMediaItems(items);
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

  const header = (
    <View style={{ paddingTop: space.padHeaderTop, paddingBottom: 0 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: space.gap }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
            <Button variant="text" onPress={() => router.push('/')}>Library</Button>
            {breadcrumbs.map((crumb, i) => (
              <View key={crumb.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ color: colors.border, fontSize: fontSize.sm }}>/</Text>
                <Button variant="text" onPress={() => router.push(`/folder/${crumb.id}`)}>{crumb.name}</Button>
              </View>
            ))}
          </View>
          <Text style={{ fontSize: fontSize.xl, fontWeight: '700', color: colors.textEm }}>{folder?.name || breadcrumbs[breadcrumbs.length - 1]?.name || 'Folder'}</Text>
          <Text style={{ color: colors.textMut, fontSize: fontSize.sm }}>{mediaItems.length} items</Text>
        </View>
        <Select
          value={sort}
          onChange={setSort}
          options={[{ value: 'filename', label: 'Name' }, { value: 'date', label: 'Date' }]}
        />
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {subfolders.length === 0 && mediaItems.length === 0 ? (
        <EmptyState icon={<Icon name="folder" size="2xl" />} title="Empty folder" description="This folder contains no media yet." />
      ) : (
        <Grid folders={subfolders} items={mediaItems} onMediaPress={item => router.push(`/media/${item.id}`)} onLike={likeMedia} header={header} />
      )}
    </View>
  );
}
