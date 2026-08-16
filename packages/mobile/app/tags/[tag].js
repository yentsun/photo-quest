import { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMediaActions } from '../../hooks/useMedia';
import { useShuffle } from '../../hooks/useShuffle';
import { useRefresh } from '../../contexts/RefreshContext';
import usePersistedState from '../../hooks/usePersistedState';
import { fetchMedia } from '../../services/api';
import Grid from '../../components/Grid';
import EmptyState from '../../components/EmptyState';
import Button from '../../components/Button';
import Icon from '../../components/Icon';
import Loader from '../../components/Loader';
import Select from '../../components/Select';
import { colors, fontSize, space } from '../../theme/tokens';

const tagCache = new Map();

export default function TagPage() {
  const { tag } = useLocalSearchParams();
  const router = useRouter();
  const { likeMedia } = useMediaActions();
  const shuffle = useShuffle();
  const { signal } = useRefresh();
  const decodedTag = decodeURIComponent(tag);

  const cached = tagCache.get(decodedTag);
  const [items, setItems] = useState(cached?.items ?? []);
  const [total, setTotal] = useState(cached?.total ?? 0);
  const [loading, setLoading] = useState(!cached);
  const [mediaFilter, setMediaFilter] = usePersistedState('library:mediaFilter', 'all');

  useEffect(() => {
    let cancelled = false;
    fetchMedia({ tag: decodedTag, limit: 10000, type: mediaFilter !== 'all' ? mediaFilter : undefined })
      .then(({ items: mediaItems, total: t }) => {
        if (cancelled) return;
        setItems(mediaItems);
        setTotal(t);
        tagCache.set(decodedTag, { items: mediaItems, total: t });
        setLoading(false);
      })
      .catch(err => { console.error(err); if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [decodedTag, signal, mediaFilter]);

  if (loading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}><Loader message={`"${decodedTag}"…`} /></View>;

  const header = (
    <View style={{ paddingTop: space.padHeaderTop, paddingBottom: 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.gap, marginBottom: space.gap }}>
        <Button variant="text" onPress={() => router.push('/tags')}>Tags</Button>
        <Text style={{ color: colors.border }}>/</Text>
        <Text style={{ fontSize: fontSize.xl, fontWeight: '700', color: colors.textEm }}>{decodedTag}</Text>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.gap }}>
        <Text style={{ color: colors.textMut, fontSize: fontSize.sm }}>{total.toLocaleString()} item{total !== 1 ? 's' : ''}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.gap }}>
          <Button variant="ghost" size="sm" icon={<Icon name="shuffle" size="xs" />} onPress={() => shuffle({ tag: decodedTag })} disabled={total === 0}>Shuffle</Button>
          <Select
            value={mediaFilter}
            onChange={setMediaFilter}
            options={[{ value: 'all', label: 'All' }, { value: 'image', label: 'Photos' }, { value: 'video', label: 'Videos' }]}
          />
        </View>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {items.length > 0 ? (
        <Grid folders={[]} items={items} onMediaPress={item => router.push(`/media/${item.id}`)} onLike={likeMedia} header={header} />
      ) : (
        <EmptyState icon={<Icon name="list" size="2xl" />} title={`No media tagged "${decodedTag}"`} description="Tag items from the media viewer." />
      )}
    </View>
  );
}
