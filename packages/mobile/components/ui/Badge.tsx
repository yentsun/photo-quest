import { View, Text, StyleSheet } from 'react-native';
import { colors, fontSize, radius, spacing } from './theme';

type Variant = 'default' | 'primary' | 'success' | 'warning' | 'error';

interface BadgeProps {
  count: number | string;
  variant?: Variant;
}

export function Badge({ count, variant = 'default' }: BadgeProps) {
  return (
    <View style={[styles.base, styles[`variant_${variant}`]]}>
      <Text style={styles.text}>{count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 20,
  },
  variant_default: { backgroundColor: colors.bgHighlight },
  variant_primary: { backgroundColor: colors.accent },
  variant_success: { backgroundColor: colors.green },
  variant_warning: { backgroundColor: colors.yellow },
  variant_error: { backgroundColor: colors.red },
  text: {
    color: colors.fg,
    fontSize: fontSize.xs,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
});
