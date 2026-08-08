import { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useMediaActions } from '../hooks/useMediaActions';
import { useRefresh } from '../contexts/RefreshContext';
import { useSlideshow } from '../contexts/SlideshowContext';
import { useScan } from '../contexts/ScanContext';
import { fetchFolders, fetchMedia } from '../utils/api';
import { usePersistedState } from '../hooks/usePersistedState';
import { FolderCard } from '../components/media/FolderCard';
import { MediaGrid } from '../components/media/MediaGrid';
import { EmptyState } from '../components/layout/EmptyState';
import { Button, Icon, Input, Loader, Modal, Select } from '../components/ui';
import { colors, spacing, fontSize } from '../components/ui/theme';

const SEARCH_PAGE_SIZE = 30;

function byFolderName(a: any, b: any) {
  const na = (a.path || '').split(/[/\\]/).pop() || '';
  const nb = (b.path || '').split(/[/\\]/).pop() || '';
  return na.localeCompare(nb);
}

function byFolderDate(a: any, b: any) {
  return b.id - a.id;
}

export default function Dashboard() {
  const router = useRouter();
  const { likeMedia, refreshLibrary, removeFolder } = useMediaActions();
  const { signal, bump } = useRefresh();
  const slideshow = useSlideshow();
  const { isScanning } = useScan();

  const [folders, setFolders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddFolder, setShowAddFolder] = useState(false);
  const [selectedPath, setSelectedPath] = useState('');
  const [scanProgress, setScanProgress] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchPage, setSearchPage] = useState(0);
  const [folderSort, setFolderSort] = usePersistedState('dashboard:sort', 'name');

  useEffect(() => {
    let cancelled = false;
    fetchFolders()
      .then((data) => {
        if (!cancelled) { setFolders(data); setLoading(false); }
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [signal]);

  useEffect(() => {
    if (!searchQuery) {
      setSearchResults([]);
      setSearchTotal(0);
      return;
    }
    let cancelled = false;
    setSearchLoading(true);
    fetchMedia({ search: searchQuery, limit: SEARCH_PAGE_SIZE, offset: searchPage * SEARCH_PAGE_SIZE })
      .then(({ items, total }: any) => {
        if (!cancelled) { setSearchResults(items); setSearchTotal(total); }
      })
      .finally(() => { if (!cancelled) setSearchLoading(false); });
    return () => { cancelled = true; };
  }, [searchQuery, searchPage]);

  const rootFolders = useMemo(
    () => folders.filter((f: any) => f.parentId === null).sort(folderSort === 'date' ? byFolderDate : byFolderName),
    [folders, folderSort]
  );

  const totalMedia = useMemo(
    () => rootFolders.reduce((sum: number, f: any) => sum + (f.subtreeMediaCount || 0), 0),
    [rootFolders]
  );

  const handleRefresh = async () => {
    if (rootFolders.length === 0) return;
    setScanProgress('Refreshing library...');
    try {
      const result = await refreshLibrary(folders, (msg: string) => setScanProgress(msg));
      setScanProgress(`Refreshed. Found ${result.newFiles} file${result.newFiles !== 1 ? 's' : ''}.`);
      setTimeout(() => setScanProgress(null), 3000);
    } catch (err: any) {
      setScanProgress('Refresh failed');
      setTimeout(() => setScanProgress(null), 5000);
    }
  };

  const handleRemoveFolder = async (folder: any) => {
    try {
      await removeFolder(folder.id);
    } catch (err) {
      console.error('Failed to remove folder:', err);
    }
  };

  const searchPageCount = Math.ceil(searchTotal / SEARCH_PAGE_SIZE);

  if (loading) return <Loader message="Fetching your media folders..." />;

  return (
    <ScrollView style={styles.page}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Library</Text>
          <Text style={styles.subtitle}>{totalMedia} items</Text>
        </View>
        <View style={styles.actions}>
          {totalMedia > 0 && (
            <Button variant="ghost" size="sm" onPress={() => {}} icon={<Icon name="shuffle" size={14} />}>Shuffle</Button>
          )}
          {rootFolders.length > 0 && (
            <Button variant="ghost" size="sm" onPress={handleRefresh} disabled={isScanning} icon={<Icon name="refresh" size={14} />}>Refresh</Button>
          )}
          <Select
            value={folderSort}
            onChange={(v) => setFolderSort(v)}
            options={[{ value: 'name', label: 'Name' }, { value: 'date', label: 'Date' }]}
          />
          <Button variant="ghost" size="sm" onPress={() => setShowAddFolder(true)} disabled={isScanning} icon={<Icon name="folder" size={14} />}>Add</Button>
          <Button variant="ghost" size="sm" onPress={() => setSearchOpen(true)} icon={<Icon name="search" size={14} />}>Search</Button>
        </View>
      </View>

      {scanProgress && (
        <View style={styles.scanNotice}>
          <Text style={styles.scanNoticeText}>{scanProgress}</Text>
        </View>
      )}

      {searchQuery ? (
        searchLoading ? <Loader /> : searchResults.length > 0 ? (
          <MediaGrid
            items={searchResults}
            onItemClick={(m) => router.push(`/media/${m.id}` as any)}
            onItemLike={likeMedia}
          />
        ) : (
          <EmptyState icon={<Icon name="search" size={32} color={colors.fgDim} />} title="No results" description={`No media matching "${searchQuery}".`} />
        )
      ) : rootFolders.length > 0 ? (
        <View style={styles.folderGrid}>
          {rootFolders.map((folder: any) => (
            <FolderCard key={folder.id} folder={folder} onRemove={() => handleRemoveFolder(folder)} />
          ))}
        </View>
      ) : (
        <EmptyState
          icon={<Icon name="folder" size={32} color={colors.fgDim} />}
          title="No media yet"
          description="Add a folder from your device to start building your library."
          action={{ label: 'Add Folder', onClick: () => setShowAddFolder(true) }}
        />
      )}

      {searchPageCount > 1 && (
        <View style={styles.pagination}>
          <Button variant="ghost" size="sm" disabled={searchPage === 0} onPress={() => setSearchPage(searchPage - 1)} icon={<Icon name="prev" size={14} />} />
          <Button variant="ghost" size="sm" disabled={searchPage >= searchPageCount - 1} onPress={() => setSearchPage(searchPage + 1)} icon={<Icon name="next" size={14} />} />
        </View>
      )}

      <Modal open={searchOpen} onClose={() => setSearchOpen(false)} title="Search">
        <View style={{ gap: spacing.md }}>
          <Input placeholder="Search by title..." value={searchQuery} onChangeText={setSearchQuery} autoFocus />
          {searchQuery && <Button variant="text" onPress={() => { setSearchQuery(''); setSearchOpen(false); }}>Clear search</Button>}
        </View>
      </Modal>

      <Modal open={showAddFolder} onClose={() => setShowAddFolder(false)} title="Add Folder">
        <View style={{ gap: spacing.md }}>
          <Input placeholder="Enter folder path..." value={selectedPath} onChangeText={setSelectedPath} />
          <Text style={{ color: colors.fgDim, fontSize: fontSize.xs, fontFamily: 'monospace' }}>
            Enter the full path to a media folder on your device.
          </Text>
          {selectedPath ? (
            <Button variant="primary" onPress={() => { setShowAddFolder(false); }}>Add</Button>
          ) : null}
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
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
  scanNotice: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.bgHighlight,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  scanNoticeText: { color: colors.fg, fontSize: fontSize.sm, fontFamily: 'monospace' },
  folderGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 4 },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.lg,
  },
});
