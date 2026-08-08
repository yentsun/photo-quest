import { Pressable, Text, StyleSheet } from 'react-native';
import { Icon } from '../ui/Icon';
import { colors, fontSize, spacing } from '../ui/theme';

interface LikeButtonProps {
  count?: number;
  onLike?: () => void;
  size?: 'sm' | 'md' | 'lg';
}

export function LikeButton({ count = 0, onLike, size = 'md' }: LikeButtonProps) {
  const iconSize = size === 'sm' ? 14 : size === 'lg' ? 22 : 18;
  const hasLikes = count > 0;
  const displayCount = count > 999 ? '999+' : String(count);

  return (
    <Pressable
      style={[styles.base, styles[`size_${size}`]]}
      onPress={(e) => { e.stopPropagation(); onLike?.(); }}
      accessibilityLabel={`Like (${count} likes)`}
    >
      <Icon
        name="heart"
        size={iconSize}
        color={hasLikes ? colors.red : colors.fgDim}
      />
      {count > 0 && <Text style={styles.count}>{displayCount}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  size_sm: { padding: spacing.xs },
  size_md: { padding: spacing.xs },
  size_lg: { padding: spacing.sm },
  count: {
    color: colors.fgDim,
    fontSize: fontSize.xs,
    fontFamily: 'monospace',
  },
});
