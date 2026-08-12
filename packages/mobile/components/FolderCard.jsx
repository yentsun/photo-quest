import { useState, useCallback } from 'react';
import { View, Text, Image, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { getThumbUrl, renameFolder } from '../services/api';
import { useRefresh } from '../contexts/RefreshContext';
import Card from './Card';
import Icon from './Icon';
import IconButton from './IconButton';
import { colors, fontSize, fontFamily } from '../theme/tokens';

export default function FolderCard({ folder, onRemove }) {
  const router = useRouter();
  const { bump } = useRefresh();
  const pathName = folder.path.split(/[/\\]/).filter(Boolean).pop() || 'Folder';
  const [displayName, setDisplayName] = useState(folder.name || pathName);
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const thumbnailUrl = folder.previewMediaId ? getThumbUrl(folder.previewMediaId, folder.thumbnailTime) : null;
  const imageCount = folder.subtreeImageCount ?? folder.imageCount ?? 0;
  const videoCount = folder.subtreeVideoCount ?? folder.videoCount ?? 0;

  const startEdit = useCallback(() => {
    setNameInput(displayName);
    setEditing(true);
  }, [displayName]);

  const saveEdit = useCallback(async () => {
    if (!editing) return;
    setEditing(false);
    const trimmed = nameInput.trim();
    if (trimmed === displayName) return;
    const prev = displayName;
    setDisplayName(trimmed || pathName);
    try { await renameFolder(folder.id, trimmed || null); bump(); } catch { setDisplayName(prev); }
  }, [editing, nameInput, displayName, pathName, folder.id, bump]);

  const handleKeyDown = (e) => {
    if (e.nativeEvent.key === 'Enter') { e.preventDefault?.(); saveEdit(); }
    if (e.nativeEvent.key === 'Escape') { setEditing(false); setNameInput(displayName); }
  };

  return (
    <Card onPress={editing ? undefined : () => router.push(`/folder/${folder.id}`)}>
      <Card.ImageArea>
        {thumbnailUrl ? (
          <Image source={{ uri: thumbnailUrl }} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} resizeMode="cover" />
        ) : (
          <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="folder" size="2xl" color={colors.textMut} />
          </View>
        )}

        <View style={{ position: 'absolute', top: 6, left: 6 }}>
          <IconButton icon={<Icon name="edit" size="sm" />} onPress={startEdit} label="Rename folder" variant="overlay" size="sm" />
        </View>

        {onRemove && (
          <View style={{ position: 'absolute', top: 6, right: 6 }}>
            <IconButton icon={<Icon name="close" size="sm" />} onPress={onRemove} label="Remove folder" variant="overlay" size="sm" />
          </View>
        )}
      </Card.ImageArea>

      <Card.Footer>
        {editing ? (
          <TextInput
            style={{ backgroundColor: colors.dim, borderWidth: 1, borderColor: colors.accent, color: colors.textEm, fontSize: fontSize.sm, fontFamily: fontFamily.mono, paddingHorizontal: 4, paddingVertical: 1 }}
            value={nameInput}
            onChangeText={setNameInput}
            onBlur={saveEdit}
            onKeyPress={handleKeyDown}
            autoFocus
          />
        ) : (
          <Text style={{ color: colors.textEm, fontSize: fontSize.sm, fontFamily: fontFamily.mono }} numberOfLines={1}>{displayName}</Text>
        )}
        {(imageCount > 0 || videoCount > 0) && (
          <Text style={{ color: colors.textMut, fontSize: fontSize.xs, marginTop: 1 }}>
            {imageCount > 0 && `${imageCount} image${imageCount !== 1 ? 's' : ''}`}
            {imageCount > 0 && videoCount > 0 && ', '}
            {videoCount > 0 && `${videoCount} video${videoCount !== 1 ? 's' : ''}`}
          </Text>
        )}
      </Card.Footer>
    </Card>
  );
}
