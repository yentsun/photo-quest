import { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMediaActions } from '../../hooks/useMedia';
import { useRefresh } from '../../contexts/RefreshContext';
import { fetchMedia } from '../../services/api';
import MediaGrid from '../../components/MediaGrid';
import EmptyState from '../../components/EmptyState';
import Button from '../../components/Button';
import Icon from '../../components/Icon';
import Loader from '../../components/Loader';
import { colors, fontSize } from '../../theme/tokens';

export default function TagPage() {
  const { tag } = useLocalSearchParams();
  const router = useRouter();
  const { likeMedia } = useMediaActions();
  const { signal } = useRefresh();
  const decodedTag = decodeURIComponent(tag);

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMedia({ tag: decodedTag, limit: 10000 })
      .then(({ items, total: t }) => {
        if (cancelled) return;
        setItems(items);
        setTotal(t);
        setLoading(false);
      })
      .catch(err => { console.error(err); if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [decodedTag, signal]);

  if (loading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}><Loader message={`"${decodedTag}"…`} /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 24 }}>
        <Button variant="text" onPress={() => router.push('/tags')}>Tags</Button>
        <Text style={{ color: colors.border }}>/</Text>
        <Text style={{ fontSize: fontSize.xl, fontWeight: '700', color: colors.textEm }}>{decodedTag}</Text>
      </View>
      <Text style={{ color: colors.textMut, fontSize: fontSize.sm, marginBottom: 16 }}>{total.toLocaleString()} item{total !== 1 ? 's' : ''}</Text>
      {items.length > 0 ? (
        <MediaGrid items={items} onPress={item => router.push(`/media/${item.id}`)} onLike={likeMedia} />
      ) : (
        <EmptyState icon={<Icon name="list" size="2xl" />} title={`No media tagged "${decodedTag}"`} description="Tag items from the media viewer." />
      )}
    </View>
  );
}
