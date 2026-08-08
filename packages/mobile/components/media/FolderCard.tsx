import { useState, useRef, useCallback } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { getThumbUrl } from '../../utils/api';
import { useRefresh } from '../../contexts/RefreshContext';
import { Icon, IconButton } from '../ui';
import { colors, spacing, fontSize, radius } from '../ui/theme';

interface Folder {
  id: number;
  path: string;
  name?: string;
  previewMediaId?: number;
  thumbnailTime?: number;
  subtreeImageCount?: number;
  imageCount?: number;
  subtreeVideoCount?: number;
  videoCount?: number;
  subtreeMediaCount?: number;
}

interface FolderCardProps {
  folder: Folder;
  onRemove?: () => void;
}

export function FolderCard({ folder, onRemove }: FolderCardProps) {
  const router = useRouter();
  const pathName = folder.path.split(/[/\\]/).filter(Boolean).pop() || 'Folder';
  const [displayName, setDisplayName] = useState(folder.name || pathName);
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const inputRef = useRef<TextInput>(null);
  const thumbnailUrl = folder.previewMediaId ? getThumbUrl(folder.previewMediaId, folder.thumbnailTime) : null;
  const imageCount = folder.subtreeImageCount ?? folder.imageCount ?? 0;
  const videoCount = folder.subtreeVideoCount ?? folder.videoCount ?? 0;

  const startEdit = useCallback(() => {
    setNameInput(displayName);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [displayName]);

  const saveEdit = useCallback(async () => {
    if (!editing) return;
    setEditing(false);
    const trimmed = nameInput.trim();
    if (trimmed === displayName) return;
    setDisplayName(trimmed || pathName);
  }, [editing, nameInput, displayName, pathName]);

  return (
    <Pressable style={styles.card} onPress={() => router.push(`/folder/${folder.id}` as any)}>
      <View style={styles.frame}>
        {thumbnailUrl ? (
          <Image source={{ uri: thumbnailUrl }} style={styles.thumb} contentFit="cover" />
        ) : (
          <View style={styles.placeholder}>
            <Icon name="folder" size={32} color={colors.fgDim} />
          </View>
        )}
        <View style={styles.renameBtn}>
          <IconButton icon={<Icon name="edit" size={14} />} label="Rename folder" onPress={startEdit} variant="overlay" size="sm" />
        </View>
        {onRemove && (
          <View style={styles.removeBtn}>
            <IconButton icon={<Icon name="close" size={14} />} label="Remove folder" onPress={onRemove} variant="overlay" size="sm" />
          </View>
        )}
      </View>

      <View style={styles.meta}>
        {editing ? (
          <TextInput
            ref={inputRef}
            style={styles.renameInput}
            value={nameInput}
            onChangeText={setNameInput}
            onBlur={saveEdit}
            onSubmitEditing={saveEdit}
            autoFocus
          />
        ) : (
          <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
        )}
        {(imageCount > 0 || videoCount > 0) && (
          <Text style={styles.counts}>
            {imageCount > 0 ? `${imageCount} image${imageCount !== 1 ? 's' : ''}` : ''}
            {imageCount > 0 && videoCount > 0 ? ', ' : ''}
            {videoCount > 0 ? `${videoCount} video${videoCount !== 1 ? 's' : ''}` : ''}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    maxWidth: '50%',
    padding: 4,
  },
  frame: {
    aspectRatio: 16 / 10,
    backgroundColor: colors.bgHighlight,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  thumb: { width: '100%', height: '100%' },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgHighlight,
  },
  renameBtn: { position: 'absolute', top: spacing.xs, left: spacing.xs },
  removeBtn: { position: 'absolute', top: spacing.xs, right: spacing.xs },
  meta: { paddingVertical: spacing.xs, paddingHorizontal: spacing.xs },
  name: { color: colors.fg, fontSize: fontSize.sm, fontFamily: 'monospace' },
  renameInput: {
    backgroundColor: colors.bgHighlight,
    color: colors.fg,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    fontSize: fontSize.sm,
    fontFamily: 'monospace',
  },
  counts: { color: colors.fgDim, fontSize: fontSize.xs, fontFamily: 'monospace', marginTop: 2 },
});
