import { Pressable, StyleSheet, type PressableProps } from 'react-native';
import { colors, spacing, radius } from './theme';
import type { ReactNode } from 'react';

type Variant = 'default' | 'overlay';
type Size = 'sm' | 'md' | 'lg';

interface IconButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  icon: ReactNode;
  label: string;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
}

export function IconButton({ icon, variant = 'default', size = 'md', disabled, ...rest }: IconButtonProps) {
  const btnStyle = [
    styles.base,
    styles[`size_${size}`],
    variant === 'overlay' && styles.overlay,
    disabled && styles.disabled,
  ];

  return (
    <Pressable style={({ pressed }) => [btnStyle, pressed && styles.pressed]} disabled={disabled} accessibilityLabel={rest.label} {...rest}>
      {icon}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  pressed: { opacity: 0.5 },
  disabled: { opacity: 0.3 },

  overlay: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: radius.lg,
  },

  size_sm: { padding: spacing.xs },
  size_md: { padding: spacing.sm },
  size_lg: { padding: spacing.md },
});
