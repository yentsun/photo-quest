import { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useMediaActions } from '../hooks/useMedia';
import { useRefresh } from '../contexts/RefreshContext';
import { fetchMedia } from '../services/api';
import Grid from '../components/Grid';
import EmptyState from '../components/EmptyState';
import Icon from '../components/Icon';
import Loader from '../components/Loader';
import { colors, fontSize, space } from '../theme/tokens';

const likedCache = new Map();

export default function LikedPage() {
  const router = useRouter();
  const { likeMedia } = useMediaActions();
  const { signal } = useRefresh();
  const cached = likedCache.get('liked');
  const [items, setItems] = useState(cached?.items ?? []);
  const [total, setTotal] = useState(cached?.total ?? 0);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    let cancelled = false;
    fetchMedia({ liked: true, limit: 10000 })
      .then(({ items: mediaItems, total: t }) => {
        if (cancelled) return;
        setItems(mediaItems);
        setTotal(t);
        likedCache.set('liked', { items: mediaItems, total: t });
        setLoading(false);
      })
      .catch(err => { console.error(err); if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [signal]);

  if (loading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}><Loader message="Liked…" /></View>;

  const header = (
    <View style={{ paddingTop: space.padHeaderTop, paddingBottom: 0 }}>
      <View style={{ marginBottom: space.gap }}>
        <Text style={{ fontSize: fontSize.xl, fontWeight: '700', color: colors.textEm }}>Liked</Text>
        <Text style={{ color: colors.textMut, fontSize: fontSize.sm }}>{total.toLocaleString()} item{total !== 1 ? 's' : ''}</Text>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {items.length > 0 ? (
        <Grid folders={[]} items={items} onMediaPress={item => router.push(`/media/${item.id}`)} onLike={likeMedia} header={header} />
      ) : (
        <EmptyState icon={<Icon name="heart" size="2xl" />} title="No liked items" description="Like photos and videos to see them here." />
      )}
    </View>
  );
}
