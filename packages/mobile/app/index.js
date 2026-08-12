import { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, ScrollView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useMediaActions } from '../hooks/useMedia';
import { useRefresh } from '../contexts/RefreshContext';
import { useScan } from '../contexts/ScanContext';
import { fetchFolders, fetchMedia, getLastFolders, scanMedia, uploadMedia } from '../services/api';
import { usePlaylist } from '../contexts/PlaylistContext';
import usePersistedState from '../hooks/usePersistedState';
import FolderCard from '../components/FolderCard';
import EmptyState from '../components/EmptyState';
import Button from '../components/Button';
import Icon from '../components/Icon';
import Input from '../components/Input';
import Loader from '../components/Loader';
import Modal from '../components/Modal';
import { colors, fontSize, fontFamily, space } from '../theme/tokens';
import Grid from '../components/Grid';

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

  const [folders, setFolders] = useState(() => getLastFolders() || []);
  const [mediaItems, setMediaItems] = useState(() => []);
  const [loadingItems, setLoadingItems] = useState(true);
  const [showAddFolder, setShowAddFolder] = useState(false);
  const [folderPath, setFolderPath] = useState('');
  const [importing, setImporting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const [refreshLabel, setRefreshLabel] = useState('Refresh');
  const [sortOrder, setSortOrder] = usePersistedState('dashboard-sort', 'name');
  const refreshTimer = useRef(null);

  useEffect(() => { /* stop slideshow */ }, []);

  const loadData = async () => {
    setLoadingItems(true);
    try {
      const [folderData, mediaData] = await Promise.all([
        fetchFolders().catch(() => []),
        fetchMedia({ limit: 10000 }).catch(() => ({ items: [] })),
      ]);
      setFolders(folderData.sort(sortOrder === 'name' ? byFolderName : (a, b) => b.id - a.id));
      setMediaItems(mediaData.items);
    } catch (e) { console.error(e); }
    setLoadingItems(false);
  };

  useEffect(() => { loadData(); }, [signal]);

  const handleAddFolder = async () => {
    if (!folderPath.trim()) return;
    try {
      setImporting(true); setShowAddFolder(false);
      await addFolderWithPath(folderPath.trim());
      setFolderPath('');
      await loadData();
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
    loadData();
  };

  const handleRemoveFolder = async (folder) => {
    try { await removeFolder(folder.id); loadData(); } catch (e) { console.error(e); }
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
    return <View style={{ flex: 1, backgroundColor: colors.bg }}><Loader message="Loading library…" /></View>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: space.padPage, paddingTop: 24 }}>
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
      </View>

      {folders.length === 0 && mediaItems.length === 0 ? (
        <EmptyState
          title="No media yet"
          description="Add a folder to start building your library."
          action={{ label: 'Add Folder', onClick: () => setShowAddFolder(true) }}
        />
      ) : (
        <Grid
          folders={folders}
          items={mediaItems}
          onFolderPress={folder => router.push(`/folder/${folder.id}`)}
          onFolderRemove={handleRemoveFolder}
          onMediaPress={item => router.push(`/media/${item.id}`)}
          onLike={likeMedia}
          loading={loadingItems}
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
  );
}
