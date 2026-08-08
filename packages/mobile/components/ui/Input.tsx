import { TextInput as RNTextInput, StyleSheet, type TextInputProps } from 'react-native';
import { colors, spacing, fontSize, radius } from './theme';
import { forwardRef } from 'react';

type Variant = 'default' | 'success' | 'error';

interface InputProps extends TextInputProps {
  variant?: Variant;
}

export const Input = forwardRef<RNTextInput, InputProps>(function Input({ variant = 'default', style, ...rest }, ref) {
  return (
    <RNTextInput
      ref={ref}
      style={[styles.base, variant === 'success' && styles.success, variant === 'error' && styles.error, style]}
      placeholderTextColor={colors.fgDim}
      {...rest}
    />
  );
});

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.bgHighlight,
    color: colors.fg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
    fontFamily: 'monospace',
  },
  success: { borderColor: colors.green },
  error: { borderColor: colors.red },
});
