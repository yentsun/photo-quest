import { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import { fetchTags, getLastTags } from '../../services/api';
import { TagCard } from '../../components/media';
import { EmptyState } from '../../components/layout';
import { Icon, Loader } from '../../components/ui';
import { colors, fontSize } from '../../theme/tokens';

export default function TagsPage() {
  const cached = getLastTags();
  const [tags, setTags] = useState(cached ?? []);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    fetchTags()
      .then(data => { setTags(data); setLoading(false); })
      .catch(err => { console.error(err); if (!cached) setLoading(false); });
  }, []);

  if (loading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}><Loader message="tags…" /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: 16 }}>
      <View style={{ marginBottom: 24 }}>
        <Text style={{ fontSize: fontSize.xl, fontWeight: '700', color: colors.textEm }}>Tags</Text>
        <Text style={{ color: colors.textMut, fontSize: fontSize.sm }}>{tags.length} tag{tags.length !== 1 ? 's' : ''}</Text>
      </View>
      {tags.length === 0 ? (
        <EmptyState icon={<Icon name="list" size="2xl" />} title="No tags yet" description="Open any photo or video and click '+ tag' to start tagging." />
      ) : (
        <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
          {tags.map(({ tag, count, previewMediaId, previewThumbnailTime }) => (
            <View key={tag} style={{ width: 200 }}>
              <TagCard tag={tag} count={count} previewMediaId={previewMediaId} previewThumbnailTime={previewThumbnailTime} />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
