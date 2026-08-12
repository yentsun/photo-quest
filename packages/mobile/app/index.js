import { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, ScrollView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useMediaActions } from '../hooks/useMedia';
import { useRefresh } from '../contexts/RefreshContext';
import { useScan } from '../contexts/ScanContext';
import { fetchFolders, fetchMedia, getLastFolders, scanMedia, uploadMedia } from '../services/api';
import { getPageCache, setPageCache, isPageCacheValid } from '../utils/pageCache';
import usePersistedState from '../hooks/usePersistedState';
import { FolderCard, MediaGrid } from '../components/media';
import { EmptyState } from '../components/layout';
import { Button, Icon, Input, Loader, Modal, ProgressBar } from '../components/ui';
import { colors, fontSize, fontFamily } from '../theme/tokens';
import { useBreakpoint } from '../theme/breakpoints';

function byFolderName(a, b) {
  const nameA = a.path.split(/[/\\]/).pop() || '';
  const nameB = b.path.split(/[/\\]/).pop() || '';
  return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
}

export default function Dashboard() {
  const router = useRouter();
  const { addFolderWithPath, removeFolder, refreshLibrary, likeMedia } = useMediaActions();
  const { signal, bump } = useRefresh();
  const { isScanning } = useScan();
  const { width } = useBreakpoint();

  const [folders, setFolders] = useState(() => getLastFolders() || []);
  const [mediaItems, setMediaItems] = useState(() => getPageCache('dashboard', signal)?.data?.items || []);
  const [mediaTotal, setMediaTotal] = useState(0);
  const [loadingMedia, setLoadingMedia] = useState(true);
  const [showAddFolder, setShowAddFolder] = useState(false);
  const [folderPath, setFolderPath] = useState('');
  const [importing, setImporting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const [refreshLabel, setRefreshLabel] = useState('Refresh');
  const [sortOrder, setSortOrder] = usePersistedState('dashboard-sort', 'name');
  const refreshTimer = useRef(null);

  useEffect(() => { /* stop slideshow */ }, []);

  const loadFolders = async () => {
    try {
      const data = await fetchFolders();
      const sorted = [...data].sort(sortOrder === 'name' ? byFolderName : (a, b) => b.id - a.id);
      setFolders(sorted);
    } catch (e) { console.error(e); }
  };

  const loadMedia = async () => {
    setLoadingMedia(true);
    try {
      const data = await fetchMedia({ limit: 10000 });
      setMediaItems(data.items);
      setMediaTotal(data.total);
    } catch (e) { console.error(e); }
    setLoadingMedia(false);
  };

  useEffect(() => { loadFolders(); loadMedia(); }, [signal]);

  const gridType = mediaItems?.[0]?.type;

  const handleAddFolder = async () => {
    if (!folderPath.trim()) return;
    try {
      setImporting(true); setShowAddFolder(false);
      await addFolderWithPath(folderPath.trim());
      setFolderPath('');
      await loadFolders();
    } catch (e) { console.error(e); }
    setImporting(false);
  };

  const handleRefresh = async () => {
    setRefreshLabel('Scanning…');
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    try {
      await refreshLibrary(folders, (msg) => setRefreshLabel(msg));
    } catch {}
    setRefreshLabel('Done');
    refreshTimer.current = setTimeout(() => setRefreshLabel('Refresh'), 2000);
    loadMedia();
  };

  const handleRemoveFolder = async (folder) => {
    try { await removeFolder(folder.id); loadFolders(); } catch (e) { console.error(e); }
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
      if (uploaded > 0) await loadFolders();
      setTimeout(() => setUploadMsg(''), 3000);
    } catch (e) { console.error(e); }
    setUploading(false);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }}>
    <View style={{ flex: 1, padding: 16, paddingTop: 24 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: fontSize.xl, fontWeight: '700', color: colors.textEm, letterSpacing: -0.01 * fontSize.xl }}>Library</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button variant="ghost" size="sm" icon={<Icon name="folder" size="xs" />} onPress={() => setShowAddFolder(true)}>Add Folder</Button>
          <Button variant="ghost" size="sm" icon={<Icon name="refresh" size="xs" />} onPress={handleRefresh} disabled={isScanning}>{refreshLabel}</Button>
        </View>
      </View>
      {uploadMsg ? <Text style={{ color: colors.accent, fontSize: fontSize.sm, marginBottom: 12 }}>{uploadMsg}</Text> : null}

      {folders.length > 0 && (
        <View style={{ marginBottom: 24 }}>
          <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
            {folders.map(folder => (
              <FolderCard key={folder.id} folder={folder} onRemove={() => handleRemoveFolder(folder)} />
            ))}
          </View>
        </View>
      )}

      {loadingMedia ? (
        <Loader message="Loading library…" />
      ) : mediaItems.length === 0 && folders.length === 0 ? (
        <EmptyState
          title="No media yet"
          description="Add a folder to start building your library."
          action={{ label: 'Add Folder', onClick: () => setShowAddFolder(true) }}
        />
      ) : (
        <MediaGrid
          items={mediaItems}
          onPress={item => router.push(`/media/${item.id}`)}
          onLike={likeMedia}
          loading={loadingMedia}
          nestedScroll
        />
      )}

      <Modal open={showAddFolder} onClose={() => setShowAddFolder(false)} title="Add Folder" closable={!importing && !uploading}>
        <View style={{ gap: 12 }}>
          <Text style={{ color: colors.textMut, fontSize: fontSize.sm }}>Enter the absolute path to a media folder on this machine:</Text>
          <Input
            value={folderPath}
            onChangeText={setFolderPath}
            placeholder="e.g. C:\Users\work\Photos"
            autoFocus
          />
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="ghost" onPress={() => setShowAddFolder(false)}>Cancel</Button>
            {Platform.OS !== 'web' && (
              <Button variant="ghost" icon={<Icon name="folder" size="xs" />} onPress={handlePickFiles} disabled={importing || uploading}>Pick Files</Button>
            )}
            <Button variant="primary" onPress={handleAddFolder} disabled={importing || uploading}>Add</Button>
          </View>
        </View>
      </Modal>
    </View>
    </ScrollView>
  );
}
