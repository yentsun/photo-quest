import { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useMediaActions } from '../../hooks/useMediaActions';
import { useRefresh } from '../../contexts/RefreshContext';
import { fetchMedia, fetchFoldersForParent } from '../../utils/api';
import { usePersistedState } from '../../hooks/usePersistedState';
import { FolderCard } from '../../components/media/FolderCard';
import { MediaCard } from '../../components/media/MediaCard';
import { EmptyState } from '../../components/layout/EmptyState';
import { Button, Icon, Loader, Modal, Input, Select } from '../../components/ui';
import { colors, spacing, fontSize } from '../../components/ui/theme';

const PAGE_SIZE = 30;
const FETCH_LIMIT = 10000;

function byName(a: any, b: any) {
  return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });
}

function byFolderName(a: any, b: any) {
  return (a.name || a.path || '').split(/[/\\]/).pop()?.localeCompare((b.name || b.path || '').split(/[/\\]/).pop() || '') || 0;
}

function applySort(items: any[], sort: string) {
  let result: any[];
  if (sort === 'filename') {
    result = items.slice().sort(byName);
  } else {
    result = items.slice().sort((a, b) => {
      const aDate = a.date_taken || a.created_at || '';
      const bDate = b.date_taken || b.created_at || '';
      const dc = bDate.localeCompare(aDate);
      if (dc !== 0) return dc;
      return (b.path || '').localeCompare(a.path || '');
    });
  }
  return result;
}

function getFolderName(f: any) {
  return f.name || (f.path || '').split(/[/\\]/).pop() || '';
}

export default function FolderPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { likeMedia, removeFolder } = useMediaActions();
  const { signal, bump } = useRefresh();
  const folderId = Number(id);

  const [sort, setSort] = usePersistedState(`folder:${folderId}:sort`, 'filename');
  const [mediaFilter, setMediaFilter] = usePersistedState('library:mediaFilter', 'all');
  const [page, setPage] = useState(0);

  const [folders, setFolders] = useState<any[]>([]);
  const [folderChain, setFolderChain] = useState<any[]>([]);
  const [directMedia, setDirectMedia] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchFoldersForParent(folderId)
      .then(({ items, chain }: any) => {
        if (cancelled) return;
        setFolders(items);
        setFolderChain(chain || []);
        const found = (chain || []).find((f: any) => f.id === folderId) || items.find((f: any) => f.id === folderId);
        if (found) {
          const opts: any = { folder: found.path, limit: FETCH_LIMIT, sort };
          if (mediaFilter !== 'all') opts.type = mediaFilter;
          if (searchQuery) opts.search = searchQuery;
          return fetchMedia(opts).then(({ items: media }: any) => {
            if (!cancelled) setDirectMedia(applySort(media, sort));
          });
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [folderId, signal, sort, mediaFilter, searchQuery]);

  const folder = useMemo(
    () => folderChain.find((f: any) => f.id === folderId) || folders.find((f: any) => f.id === folderId) || null,
    [folderChain, folders, folderId]
  );

  const subfolders = useMemo(
    () => folders.filter((f: any) => f.parentId === folderId).sort(byFolderName),
    [folders, folderId]
  );

  const allItems = useMemo(() => {
    if (searchQuery) return directMedia.map((m: any) => ({ kind: 'media', item: m }));
    return [
      ...subfolders.map((f: any) => ({ kind: 'folder', item: f })),
      ...directMedia.map((m: any) => ({ kind: 'media', item: m })),
    ];
  }, [subfolders, directMedia, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(allItems.length / PAGE_SIZE));
  const displayItems = allItems.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleRefresh = async () => {
    if (!folder || refreshing) return;
    setRefreshing(true);
    try { bump(); } finally { setRefreshing(false); }
  };

  const handleRemove = async () => {
    if (!folder) return;
    try { await removeFolder(folder.id); router.back(); } catch {}
  };

  if (loading) return <Loader />;

  const folderName = folder ? getFolderName(folder) : 'Folder';

  return (
    <ScrollView style={styles.page}>
      {folderChain.length > 0 && (
        <View style={styles.breadcrumbs}>
          <Button variant="text" onPress={() => router.push('/dashboard' as any)}>Library</Button>
          {folderChain.map((crumb: any, i: number) => {
            const isLast = i === folderChain.length - 1;
            const name = getFolderName(crumb);
            return (
              <View key={crumb.id} style={styles.breadcrumbItem}>
                <Text style={styles.breadcrumbSep}>/</Text>
                {isLast ? (
                  <Text style={styles.breadcrumbCurrent}>{name}</Text>
                ) : (
                  <Button variant="text" onPress={() => router.push(`/folder/${crumb.id}` as any)}>{name}</Button>
                )}
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{folderName}</Text>
          <Text style={styles.subtitle}>
            {allItems.length} item{allItems.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <View style={styles.actions}>
          <Select value={sort} onChange={(v) => { setSort(v); setPage(0); }} options={[{ value: 'filename', label: 'Name' }, { value: 'date', label: 'Date' }]} />
          <Select value={mediaFilter} onChange={(v) => { setMediaFilter(v); setPage(0); }} options={[{ value: 'all', label: 'All' }, { value: 'image', label: 'Photos' }, { value: 'video', label: 'Videos' }]} />
          <Button variant="ghost" size="sm" onPress={() => setSearchOpen(true)} icon={<Icon name="search" size={14} />}>Search</Button>
          <Button variant="ghost" size="sm" onPress={handleRefresh} disabled={refreshing} icon={<Icon name="refresh" size={14} />}>Refresh</Button>
          {folder && <Button variant="danger" size="sm" onPress={handleRemove} icon={<Icon name="trash" size={14} />}>Remove</Button>}
        </View>
      </View>

      {displayItems.length > 0 ? (
        <>
          <View style={styles.grid}>
            {displayItems.map(({ kind, item }: any) =>
              kind === 'folder' ? (
                <FolderCard key={`f-${item.id}`} folder={item} />
              ) : (
                <MediaCard key={`m-${item.id}`} media={item} onClick={(m) => router.push(`/media/${m.id}` as any)} onLike={likeMedia} />
              )
            )}
          </View>
          {totalPages > 1 && (
            <View style={styles.pagination}>
              <Button variant="ghost" size="sm" disabled={page === 0} onPress={() => setPage(page - 1)} icon={<Icon name="prev" size={14} />} />
              <Button variant="ghost" size="sm" disabled={page >= totalPages - 1} onPress={() => setPage(page + 1)} icon={<Icon name="next" size={14} />} />
            </View>
          )}
        </>
      ) : (
        <EmptyState icon={<Icon name="folder" size={32} color={colors.fgDim} />} title="No media" description="This folder is empty." />
      )}

      <Modal open={searchOpen} onClose={() => setSearchOpen(false)} title="Search">
        <Input placeholder="Search by title..." value={searchQuery} onChangeText={setSearchQuery} autoFocus />
        {searchQuery ? <Button variant="text" onPress={() => { setSearchQuery(''); setSearchOpen(false); }}>Clear search</Button> : null}
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  breadcrumbs: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: 2 },
  breadcrumbItem: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  breadcrumbSep: { color: colors.fgDim, fontSize: fontSize.md, fontFamily: 'monospace' },
  breadcrumbCurrent: { color: colors.fg, fontSize: fontSize.md, fontFamily: 'monospace', fontWeight: '600' },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: { color: colors.fg, fontSize: fontSize.xl, fontFamily: 'monospace', fontWeight: '700' },
  subtitle: { color: colors.fgDim, fontSize: fontSize.sm, fontFamily: 'monospace', marginTop: 4 },
  actions: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap', justifyContent: 'flex-end' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 4 },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.lg,
  },
});
