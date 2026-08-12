import { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useMediaActions } from '../hooks/useMedia';
import { useRefresh } from '../contexts/RefreshContext';
import { fetchMedia } from '../services/api';
import MediaGrid from '../components/MediaGrid';
import EmptyState from '../components/EmptyState';
import Button from '../components/Button';
import Icon from '../components/Icon';
import Loader from '../components/Loader';
import { colors, fontSize } from '../theme/tokens';

export default function LikedPage() {
  const router = useRouter();
  const { likeMedia } = useMediaActions();
  const { signal } = useRefresh();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchMedia({ liked: true, limit: 10000 })
      .then(({ items, total: t }) => {
        if (cancelled) return;
        setItems(items);
        setTotal(t);
        setLoading(false);
      })
      .catch(err => { console.error(err); if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [signal]);

  if (loading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}><Loader message="Liked…" /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <View>
          <Text style={{ fontSize: fontSize.xl, fontWeight: '700', color: colors.textEm }}>Liked</Text>
          <Text style={{ color: colors.textMut, fontSize: fontSize.sm }}>{total.toLocaleString()} item{total !== 1 ? 's' : ''}</Text>
        </View>
      </View>
      {items.length > 0 ? (
        <MediaGrid items={items} onPress={item => router.push(`/media/${item.id}`)} onLike={likeMedia} />
      ) : (
        <EmptyState icon={<Icon name="heart" size="2xl" />} title="No liked items" description="Like photos and videos to see them here." />
      )}
    </View>
  );
}
