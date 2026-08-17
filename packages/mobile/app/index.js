import { useState, useEffect, useRef } from 'react';
import { View, Text, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useMediaActions } from '../hooks/useMedia';
import { useShuffle } from '../hooks/useShuffle';
import { useRefresh } from '../contexts/RefreshContext';
import { useScan } from '../contexts/ScanContext';
import { fetchFolders, getLastFolders, uploadMedia, waitForScan, fetchMedia, openFolderPicker } from '../services/api';
import usePersistedState from '../hooks/usePersistedState';
import EmptyState from '../components/EmptyState';
import Button from '../components/Button';
import Icon from '../components/Icon';
import Input from '../components/Input';
import Loader from '../components/Loader';
import Modal from '../components/Modal';
import ProgressBar from '../components/ProgressBar';
import { colors, fontSize, space, fontFamily } from '../theme/tokens';
import Grid from '../components/Grid';
import Select from '../components/Select';

function byFolderName(a, b) {
  const nameA = a.path.split(/[/\\]/).pop() || '';
  const nameB = b.path.split(/[/\\]/).pop() || '';
  return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
}

const SEARCH_PAGE_SIZE = 30;

function getSearchPageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  const set = new Set([0, total - 1, current]);
  for (let i = Math.max(0, current - 2); i <= Math.min(total - 1, current + 2); i++) set.add(i);
  const sorted = [...set].sort((a, b) => a - b);
  const result = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('…');
    result.push(sorted[i]);
  }
  return result;
}

export default function Dashboard() {
  const router = useRouter();
  const { addFolderWithPath, refreshLibrary, likeMedia } = useMediaActions();
  const shuffle = useShuffle();
  const { signal, bump } = useRefresh();
  const { isScanning } = useScan();

  const [folders, setFolders] = useState(() => getLastFolders() || []);
  const [loadingItems, setLoadingItems] = useState(true);
  const [showAddFolder, setShowAddFolder] = useState(false);
  const [folderPath, setFolderPath] = useState('');
  const [importing, setImporting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const [scanMsg, setScanMsg] = useState('');
  const [scanProgress, setScanProgress] = useState(null);
  const [refreshLabel, setRefreshLabel] = useState('Refresh');
  const [sortOrder, setSortOrder] = usePersistedState('dashboard-sort', 'none');
  const [mediaFilter, setMediaFilter] = usePersistedState('library:mediaFilter', 'all');
  const refreshTimer = useRef(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchFolders, setSearchFolders] = useState([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchPage, setSearchPage] = useState(0);

  useEffect(() => { /* stop slideshow */ }, []);

  const loadData = async () => {
    setLoadingItems(true);
    try {
      const folderData = await fetchFolders().catch(() => []);
      const rootFolders = folderData.filter(f => f.parentId === null);
      if (sortOrder === 'name') rootFolders.sort(byFolderName);
      else if (sortOrder === 'date') rootFolders.sort((a, b) => b.id - a.id);
      setFolders(rootFolders);
    } catch (e) { console.error(e); }
    setLoadingItems(false);
  };

  useEffect(() => { loadData(); }, [signal]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (!debouncedSearch) { setSearchResults([]); setSearchTotal(0); return; }
    let cancelled = false;
    setSearchLoading(true);
    setSearchResults([]);
    setSearchPage(0);
    fetchMedia({ search: debouncedSearch, limit: SEARCH_PAGE_SIZE })
      .then(({ items, total }) => {
        if (cancelled) return;
        setSearchResults(items);
        setSearchTotal(total);
      })
      .catch(err => console.error('Search failed:', err))
      .finally(() => { if (!cancelled) setSearchLoading(false); });
    return () => { cancelled = true; };
  }, [debouncedSearch]);

  useEffect(() => {
    if (!debouncedSearch) { setSearchFolders([]); return; }
    let cancelled = false;
    const q = debouncedSearch.trim().toLowerCase();
    fetchFolders()
      .then(folders => {
        if (cancelled) return;
        const matches = folders.filter(f => {
          const name = (f.name || '').toLowerCase();
          const path = (f.path || '').toLowerCase();
          return name.includes(q) || path.includes(q);
        });
        setSearchFolders(matches);
      })
      .catch(() => { if (!cancelled) setSearchFolders([]); });
    return () => { cancelled = true; };
  }, [debouncedSearch]);

  useEffect(() => {
    if (!debouncedSearch || searchPage === 0) return;
    let cancelled = false;
    setSearchLoading(true);
    fetchMedia({ search: debouncedSearch, limit: SEARCH_PAGE_SIZE, offset: searchPage * SEARCH_PAGE_SIZE })
      .then(({ items }) => { if (!cancelled) setSearchResults(items); })
      .catch(err => console.error('Search page fetch failed:', err))
      .finally(() => { if (!cancelled) setSearchLoading(false); });
    return () => { cancelled = true; };
  }, [searchPage, debouncedSearch]);

  const handleAddFolder = async (pathOverride) => {
    const path = typeof pathOverride === 'string' ? pathOverride : folderPath;
    if (!path.trim()) return;
    try {
      setImporting(true); setScanMsg('Scanning folder…'); setScanProgress(null); setShowAddFolder(false);
      const scan = await addFolderWithPath(path.trim());
      await waitForScan(scan.scanId, {
        onProgress: ({ processed, total }) => {
          setScanProgress({ processed, total });
          setScanMsg(total > 0 ? `Importing ${processed}/${total}…` : 'Scanning folder…');
        },
      });
      setFolderPath('');
      setScanProgress(null);
      await loadData();
      bump();
      setScanMsg('');
    } catch (e) {
      setScanProgress(null);
      console.error(e);
      setScanMsg(e.message || 'Folder scan failed');
    }
    setImporting(false);
  };

  const handleBrowseFolder = async () => {
    if (importing || uploading) return;
    try {
      setImporting(true);
      const result = await openFolderPicker();
      setImporting(false);
      if (result?.path) handleAddFolder(result.path);
    } catch (e) {
      setImporting(false);
      console.error(e);
      setScanMsg(e.message || 'Could not open folder picker');
    }
  };

  const handleRefresh = async () => {
    setRefreshLabel('Scanning…');
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    try {
      const result = await refreshLibrary(folders, (msg) => setRefreshLabel(msg));
      setScanMsg(`Found ${result.newFiles} new file${result.newFiles !== 1 ? 's' : ''} in ${result.serverFolders} folder${result.serverFolders !== 1 ? 's' : ''}.`);
      setTimeout(() => setScanMsg(''), 4000);
    } catch { setScanMsg('Refresh failed'); }
    setRefreshLabel('Done');
    refreshTimer.current = setTimeout(() => setRefreshLabel('Refresh'), 2000);
    loadData();
  };

  const handlePickFiles = async () => {
    if (Platform.OS === 'web') return;
    try {
      const { getDocumentAsync } = require('expo-document-picker');
      const result = await getDocumentAsync({ type: ['image/*', 'video/*'], multiple: true, copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.length) return;
      setUploading(true);
      setShowAddFolder(false);
      let uploaded = 0;
      for (const asset of result.assets) {
        setUploadMsg(`Uploading ${uploaded + 1}/${result.assets.length}…`);
        try {
          await uploadMedia(asset.uri, asset.name, asset.mimeType);
          uploaded++;
        } catch (e) { console.error('Upload failed:', asset.name, e); }
      }
      setUploadMsg(uploaded > 0 ? `Uploaded ${uploaded} file${uploaded !== 1 ? 's' : ''}` : 'No files uploaded');
      if (uploaded > 0) await loadData();
      setTimeout(() => setUploadMsg(''), 3000);
    } catch (e) { console.error(e); }
    setUploading(false);
  };

  if (loadingItems) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}><Loader message="Loading library…" /></View>;
  }

  const totalMedia = folders.reduce((sum, f) => sum + (f.subtreeMediaCount || 0), 0);
  const visibleFolders = mediaFilter === 'all'
    ? folders
    : folders.filter(f => mediaFilter === 'video' ? (f.subtreeVideoCount ?? 0) > 0 : (f.subtreeImageCount ?? 0) > 0);

  const header = (
    <View style={{ paddingTop: space.padHeaderTop, paddingBottom: 0 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: space.gap }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: fontSize.xl, fontWeight: '700', color: colors.textEm, letterSpacing: -0.01 * fontSize.xl }}>{debouncedSearch ? 'Search' : 'Library'}</Text>
          <Text style={{ color: colors.textMut, fontSize: fontSize.sm }}>
            {debouncedSearch
              ? `"${debouncedSearch}" — ${searchTotal + searchFolders.length} result${searchTotal + searchFolders.length !== 1 ? 's' : ''}`
              : `${totalMedia.toLocaleString()} item${totalMedia !== 1 ? 's' : ''}`}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: space.gap }}>
          {!debouncedSearch && (
            <Select
              value={sortOrder}
              onChange={setSortOrder}
              options={[{ value: 'none', label: 'None' }, { value: 'name', label: 'Name' }, { value: 'date', label: 'Date' }]}
              placeholder="Sort by"
            />
          )}
          {!debouncedSearch && (
            <Select
              value={mediaFilter}
              onChange={setMediaFilter}
              options={[{ value: 'all', label: 'All' }, { value: 'image', label: 'Photos' }, { value: 'video', label: 'Videos' }]}
              placeholder="Type"
            />
          )}
          {!debouncedSearch && (
            <Button variant="ghost" size="sm" icon={<Icon name="shuffle" size="xs" />} onPress={() => shuffle({ type: mediaFilter !== 'all' ? mediaFilter : undefined })} disabled={totalMedia === 0}>Shuffle</Button>
          )}
          <Button variant="ghost" size="sm" icon={<Icon name="folder" size="xs" />} onPress={() => setShowAddFolder(true)}>Add Folder</Button>
          <Button variant="ghost" size="sm" icon={<Icon name="refresh" size="xs" />} onPress={handleRefresh} disabled={isScanning}>{refreshLabel}</Button>
          <Button variant={debouncedSearch ? 'primary' : 'ghost'} size="sm" icon={<Icon name="search" size="xs" />} onPress={() => setSearchOpen(true)}>Search</Button>
        </View>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {(scanMsg || uploadMsg) && (
        <View style={{ paddingHorizontal: space.padPage, paddingVertical: 8, gap: 6, borderBottomWidth: 1, borderColor: colors.border }}>
          {scanProgress ? (
            <ProgressBar value={scanProgress.processed} max={Math.max(1, scanProgress.total)} width={28} showPct={false} indeterminate={scanProgress.total === 0} />
          ) : importing ? (
            <ProgressBar indeterminate width={28} />
          ) : null}
          {scanMsg ? <Text style={{ color: colors.accent, fontSize: fontSize.sm }}>{scanMsg}</Text> : null}
          {uploadMsg ? <Text style={{ color: colors.accent, fontSize: fontSize.sm }}>{uploadMsg}</Text> : null}
        </View>
      )}
      {debouncedSearch ? (
        searchLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}><Loader message="Searching…" /></View>
        ) : searchResults.length > 0 || searchFolders.length > 0 ? (
          <View style={{ flex: 1 }}>
            <Grid
              folders={searchFolders}
              items={searchResults}
              onMediaPress={item => router.push(`/media/${item.id}`)}
              onLike={likeMedia}
              header={header}
            />
            {searchTotal > SEARCH_PAGE_SIZE && (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 }}>
                <Button variant="ghost" size="sm" disabled={searchPage === 0} onPress={() => setSearchPage(searchPage - 1)} icon={<Icon name="prev" size="xs" />} />
                {getSearchPageNumbers(searchPage, Math.ceil(searchTotal / SEARCH_PAGE_SIZE)).map((p, i) =>
                  p === '…'
                    ? <Text key={`ellipsis-${i}`} style={{ color: colors.textMut, fontFamily: fontFamily.mono }}>…</Text>
                    : <Button key={p} variant={p === searchPage ? 'primary' : 'ghost'} size="sm" onPress={() => setSearchPage(p)}>{String(p + 1)}</Button>
                )}
                <Button variant="ghost" size="sm" disabled={searchPage >= Math.ceil(searchTotal / SEARCH_PAGE_SIZE) - 1} onPress={() => setSearchPage(searchPage + 1)} icon={<Icon name="next" size="xs" />} />
              </View>
            )}
          </View>
        ) : (
          <EmptyState icon={<Icon name="search" size="2xl" />} title="No results" description={`No media or folders matching "${debouncedSearch}".`} />
        )
      ) : folders.length === 0 ? (
        <EmptyState
          title="No media yet"
          description="Add a folder to start building your library."
          action={{ label: 'Add Folder', onPress: () => setShowAddFolder(true) }}
        />
      ) : visibleFolders.length === 0 ? (
        <EmptyState
          icon={<Icon name={mediaFilter === 'video' ? 'video' : 'image'} size="2xl" />}
          title={mediaFilter === 'video' ? 'No videos' : 'No photos'}
          description={`No folders contain ${mediaFilter === 'video' ? 'videos' : 'photos'}.`}
        />
      ) : (
        <Grid
          folders={visibleFolders}
          items={[]}
          onMediaPress={item => router.push(`/media/${item.id}`)}
          onLike={likeMedia}
          header={header}
        />
      )}

      <Modal open={showAddFolder} onClose={() => setShowAddFolder(false)} title="Add Folder" closable={!importing && !uploading}>
        <View style={{ gap: space.gap }}>
          <Text style={{ color: colors.textMut, fontSize: fontSize.sm }}>Enter the absolute path to a media folder on this machine:</Text>
          <Input
            value={folderPath}
            onChangeText={setFolderPath}
            placeholder="e.g. C:\Users\work\Photos"
            autoFocus
          />
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: space.gap }}>
            <Button variant="ghost" onPress={() => setShowAddFolder(false)}>Cancel</Button>
            {Platform.OS === 'web' && (
              <Button variant="ghost" size="sm" icon={<Icon name="folder" size="xs" />} onPress={handleBrowseFolder} disabled={importing || uploading}>Browse</Button>
            )}
            {Platform.OS !== 'web' && (
              <Button variant="ghost" size="sm" icon={<Icon name="folder" size="xs" />} onPress={handlePickFiles} disabled={importing || uploading}>Pick Files</Button>
            )}
            <Button variant="primary" onPress={handleAddFolder} disabled={importing || uploading}>Add</Button>
          </View>
        </View>
      </Modal>

      <Modal open={searchOpen} onClose={() => setSearchOpen(false)} title="Search">
        <View style={{ gap: space.gap }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="search" size="sm" color={colors.textMut} />
            <View style={{ flex: 1 }}>
              <Input
                placeholder="Search by title…"
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={() => setSearchOpen(false)}
                autoFocus
              />
            </View>
          </View>
          {!!debouncedSearch && !searchLoading && (
            <Text style={{ color: colors.textMut, fontSize: fontSize.sm }}>
              {searchTotal > 0 || searchFolders.length > 0
                ? `${searchTotal + searchFolders.length} result${searchTotal + searchFolders.length !== 1 ? 's' : ''} — press Enter or close to view`
                : `No results for "${debouncedSearch}"`}
            </Text>
          )}
          {!!debouncedSearch && (
            <Button variant="text" onPress={() => { setSearchQuery(''); setDebouncedSearch(''); setSearchPage(0); }}>Clear search</Button>
          )}
        </View>
      </Modal>
    </View>
  );
}
