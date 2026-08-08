import { Pressable, Text, StyleSheet, type PressableProps } from 'react-native';
import { colors, spacing, fontSize, radius } from './theme';
import type { ReactNode } from 'react';

type Variant = 'primary' | 'ghost' | 'danger' | 'text';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  children?: ReactNode;
  disabled?: boolean;
}

export function Button({ variant = 'primary', size = 'md', icon, children, disabled, ...rest }: ButtonProps) {
  const btnStyle = [
    styles.base,
    styles[`variant_${variant}`],
    styles[`size_${size}`],
    disabled && styles.disabled,
  ];

  const textStyle = [
    styles.text,
    styles[`text_${variant}`],
    styles[`textSize_${size}`],
    disabled && styles.textDisabled,
  ];

  return (
    <Pressable style={({ pressed }) => [btnStyle, pressed && styles.pressed]} disabled={disabled} {...rest}>
      {icon}
      {typeof children === 'string' ? <Text style={textStyle}>{children}</Text> : children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },

  variant_primary: { backgroundColor: colors.accent, borderColor: colors.accent },
  variant_ghost: { backgroundColor: 'transparent', borderColor: colors.bgHighlight },
  variant_danger: { backgroundColor: colors.red, borderColor: colors.red },
  variant_text: { backgroundColor: 'transparent', borderWidth: 0 },

  size_sm: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  size_md: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  size_lg: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md },

  text: { fontFamily: 'monospace', fontWeight: '600' },
  text_primary: { color: colors.white },
  text_ghost: { color: colors.fg },
  text_danger: { color: colors.white },
  text_text: { color: colors.accent },

  textSize_sm: { fontSize: fontSize.sm },
  textSize_md: { fontSize: fontSize.md },
  textSize_lg: { fontSize: fontSize.lg },

  textDisabled: { color: colors.fgDim },
});
