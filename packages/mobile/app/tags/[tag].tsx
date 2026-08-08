import { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useMediaActions } from '../../hooks/useMediaActions';
import { useRefresh } from '../../contexts/RefreshContext';
import { fetchMedia } from '../../utils/api';
import { MediaGrid } from '../../components/media/MediaGrid';
import { EmptyState } from '../../components/layout/EmptyState';
import { Button, Icon, Loader } from '../../components/ui';
import { colors, spacing, fontSize } from '../../components/ui/theme';

const PAGE_SIZE = 30;

function getPageNumbers(current: number, total: number): (number | string)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  const set = new Set([0, total - 1, current]);
  for (let i = Math.max(0, current - 2); i <= Math.min(total - 1, current + 2); i++) set.add(i);
  const sorted = [...set].sort((a, b) => a - b);
  const result: (number | string)[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('...');
    result.push(sorted[i]);
  }
  return result;
}

export default function TagPage() {
  const { tag } = useLocalSearchParams<{ tag: string }>();
  const router = useRouter();
  const { likeMedia } = useMediaActions();
  const { signal } = useRefresh();
  const [page, setPage] = useState(0);

  const decodedTag = decodeURIComponent(tag ?? '');

  const [media, setMedia] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMedia({ tag: decodedTag, limit: PAGE_SIZE, offset: page * PAGE_SIZE })
      .then(({ items, total: t }: any) => {
        if (cancelled) return;
        setMedia(items);
        setTotal(t);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [decodedTag, page, signal]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const itemLabel = total === 0 ? null
    : totalPages <= 1 ? `${total} item${total !== 1 ? 's' : ''}`
    : `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} of ${total} items`;

  if (loading) return <Loader message={`"${decodedTag}"...`} />;

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <View>
          <View style={styles.breadcrumb}>
            <Button variant="text" onPress={() => router.push('/tags' as any)}>Tags</Button>
            <Text style={styles.breadcrumbSep}>/</Text>
            <Text style={styles.title}>{decodedTag}</Text>
          </View>
          <Text style={styles.subtitle}>{itemLabel || '0 items'}</Text>
        </View>
        {total > 0 && (
          <Button variant="ghost" size="sm" icon={<Icon name="shuffle" size={14} />}>Shuffle</Button>
        )}
      </View>

      {media.length > 0 ? (
        <>
          <MediaGrid
            items={media}
            onItemClick={(m) => router.push(`/media/${m.id}` as any)}
            onItemLike={likeMedia}
            emptyState={
              <EmptyState
                icon={<Icon name="list" size={32} color={colors.fgDim} />}
                title={`No media tagged "${decodedTag}"`}
                description="Tag items from the media viewer."
              />
            }
          />
          {totalPages > 1 && (
            <View style={styles.pagination}>
              <Button variant="ghost" size="sm" disabled={page === 0} onPress={() => setPage(page - 1)} icon={<Icon name="prev" size={14} />} />
              {getPageNumbers(page, totalPages).map((p, i) =>
                p === '...'
                  ? <Text key={`e${i}`} style={styles.ellipsis}>...</Text>
                  : <Button key={p} variant={p === page ? 'primary' : 'ghost'} size="sm" onPress={() => setPage(p as number)}>{String((p as number) + 1)}</Button>
              )}
              <Button variant="ghost" size="sm" disabled={page >= totalPages - 1} onPress={() => setPage(page + 1)} icon={<Icon name="next" size={14} />} />
            </View>
          )}
        </>
      ) : (
        <EmptyState
          icon={<Icon name="list" size={32} color={colors.fgDim} />}
          title={`No media tagged "${decodedTag}"`}
          description="Tag items from the media viewer."
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  breadcrumb: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  breadcrumbSep: { color: colors.fgDim, fontSize: fontSize.md, fontFamily: 'monospace' },
  title: { color: colors.fg, fontSize: fontSize.xl, fontFamily: 'monospace', fontWeight: '700' },
  subtitle: { color: colors.fgDim, fontSize: fontSize.sm, fontFamily: 'monospace', marginTop: 4 },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.lg,
  },
  ellipsis: { color: colors.fgDim, fontSize: fontSize.md, fontFamily: 'monospace', paddingHorizontal: spacing.xs },
});
