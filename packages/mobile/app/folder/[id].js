import { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMediaActions } from '../../hooks/useMedia';
import { useShuffle } from '../../hooks/useShuffle';
import { useRefresh } from '../../contexts/RefreshContext';
import usePersistedState from '../../hooks/usePersistedState';
import { fetchMedia, fetchFoldersForParent } from '../../services/api';
import Grid from '../../components/Grid';
import Breadcrumbs from '../../components/Breadcrumbs';
import EmptyState from '../../components/EmptyState';
import Button from '../../components/Button';
import Icon from '../../components/Icon';
import Loader from '../../components/Loader';
import Select from '../../components/Select';
import { colors, fontSize, space } from '../../theme/tokens';

const folderCache = new Map();

export default function FolderPage() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { likeMedia } = useMediaActions();
  const shuffle = useShuffle();
  const { signal } = useRefresh();
  const folderId = Number(id);

  const cached = folderCache.get(folderId);

  const [allFolders, setAllFolders] = useState(cached?.allFolders ?? []);
  const [folderChain, setFolderChain] = useState(cached?.folderChain ?? []);
  const [mediaItems, setMediaItems] = useState(cached?.mediaItems ?? []);
  const [loading, setLoading] = useState(!cached);
  const [sort, setSort] = useState('none');
  const [mediaFilter, setMediaFilter] = usePersistedState('library:mediaFilter', 'all');

  const folder = folderChain.find(f => f.id === folderId) ?? null;
  const subfolders = allFolders.filter(f => {
    if (f.parentId !== folderId) return false;
    if (mediaFilter === 'video') return (f.subtreeVideoCount ?? 0) > 0;
    if (mediaFilter === 'image') return (f.subtreeImageCount ?? 0) > 0;
    return true;
  });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { items: folders, chain } = await fetchFoldersForParent(folderId);
        if (cancelled) return;
        setAllFolders(folders);
        setFolderChain(chain);
        const found = chain.find(f => f.id === folderId) ?? folders.find(f => f.id === folderId);
        let nextItems = mediaItems;
        if (found) {
          const res = await fetchMedia({ folder: found.path, limit: 10000, sort, type: mediaFilter !== 'all' ? mediaFilter : undefined });
          if (cancelled) return;
          nextItems = res.items;
        }
        setMediaItems(nextItems);
        folderCache.set(folderId, { allFolders: folders, folderChain: chain, mediaItems: nextItems });
      } catch (err) { console.error(err); }
      if (!cancelled) setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [folderId, signal, sort, mediaFilter]);

  const breadcrumbs = folderChain.map((crumb) => ({
    id: crumb.id,
    name: crumb.path.split(/[/\\]/).filter(Boolean).pop() || 'Folder',
  }));

  if (loading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}><Loader message="Loading folder…" /></View>;

  const header = (
    <View style={{ paddingTop: space.padHeaderTop, paddingBottom: 0 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: space.gap }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: fontSize.xl, fontWeight: '700', color: colors.textEm }}>{folder?.name || breadcrumbs[breadcrumbs.length - 1]?.name || 'Folder'}</Text>
          <Text style={{ color: colors.textMut, fontSize: fontSize.sm }}>{mediaItems.length} items</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.gap }}>
          <Button variant="ghost" size="sm" icon={<Icon name="shuffle" size="xs" />} onPress={() => shuffle({ folder: folder?.path, subtree: true, type: mediaFilter !== 'all' ? mediaFilter : undefined })} disabled={!folder?.path}>Shuffle</Button>
          <Select
            value={sort}
            onChange={setSort}
            options={[{ value: 'none', label: 'None' }, { value: 'filename', label: 'Name' }, { value: 'date', label: 'Date' }]}
            placeholder="Sort by"
          />
          <Select
            value={mediaFilter}
            onChange={setMediaFilter}
            options={[{ value: 'all', label: 'All' }, { value: 'image', label: 'Photos' }, { value: 'video', label: 'Videos' }]}
            placeholder="Type"
          />
        </View>
      </View>
      <View style={{ marginBottom: space.gap }}>
        <Breadcrumbs items={breadcrumbs} />
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
