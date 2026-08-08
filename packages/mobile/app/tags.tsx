import { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { fetchTags } from '../utils/api';
import { getThumbUrl } from '../utils/api';
import { EmptyState } from '../components/layout/EmptyState';
import { Icon, Loader } from '../components/ui';
import { colors, spacing, fontSize, radius } from '../components/ui/theme';

interface TagItem {
  tag: string;
  count: number;
  previewMediaId?: number;
  previewThumbnailTime?: number;
}

export default function TagsPage() {
  const router = useRouter();
  const [tags, setTags] = useState<TagItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTags()
      .then((data) => { setTags(data); setLoading(false); })
      .catch(() => { setLoading(false); });
  }, []);

  if (loading) return <Loader message="tags..." />;

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.title}>Tags</Text>
        <Text style={styles.subtitle}>{tags.length} tag{tags.length !== 1 ? 's' : ''}</Text>
      </View>

      {tags.length === 0 ? (
        <EmptyState
          icon={<Icon name="list" size={32} color={colors.fgDim} />}
          title="No tags yet"
          description="Open any photo or video and click '+ tag' to start tagging."
        />
      ) : (
        <View style={styles.grid}>
          {tags.map(({ tag, count, previewMediaId, previewThumbnailTime }) => (
            <Pressable
              key={tag}
              style={styles.tagCard}
              onPress={() => router.push(`/tags/${encodeURIComponent(tag)}` as any)}
            >
              <View style={styles.tagFrame}>
                {previewMediaId != null ? (
                  <Image
                    source={{ uri: getThumbUrl(previewMediaId, previewThumbnailTime) }}
                    style={styles.tagThumb}
                    contentFit="cover"
                  />
                ) : (
                  <View style={styles.tagPlaceholder}>
                    <Icon name="list" size={24} color={colors.fgDim} />
                  </View>
                )}
              </View>
              <View style={styles.tagMeta}>
                <Text style={styles.tagName} numberOfLines={1}>{tag}</Text>
                <Text style={styles.tagCount}>{count}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: { color: colors.fg, fontSize: fontSize.xl, fontFamily: 'monospace', fontWeight: '700' },
  subtitle: { color: colors.fgDim, fontSize: fontSize.sm, fontFamily: 'monospace', marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: spacing.sm },
  tagCard: { width: '33.33%', padding: spacing.sm },
  tagFrame: {
    aspectRatio: 16 / 10,
    backgroundColor: colors.bgHighlight,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  tagThumb: { width: '100%', height: '100%' },
  tagPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgHighlight,
  },
  tagMeta: {
    paddingVertical: spacing.xs,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tagName: { color: colors.fg, fontSize: fontSize.sm, fontFamily: 'monospace', flex: 1 },
  tagCount: { color: colors.fgDim, fontSize: fontSize.xs, fontFamily: 'monospace' },
});
