import { forwardRef } from 'react';
import { TextInput } from 'react-native';
import { colors, fontSize, fontFamily, layout, accents } from '../theme/tokens';

const BASE = {
  display: 'block',
  width: '100%',
  height: layout.rowHeight,
  paddingHorizontal: 10,
  backgroundColor: colors.bg,
  borderWidth: 1,
  borderColor: colors.border,
  color: colors.textEm,
  fontFamily: fontFamily.mono,
  fontSize: fontSize.base,
  outline: 'none',
};

const VARIANTS = {
  success: {
    borderColor: colors.accent, // matches .input-success in CSS
    focusBorder: colors.accent, focusShadow: `inset 0 0 0 1px ${colors.accent}`,
  },
  error: {
    borderColor: accents.red,
    focusBorder: accents.red, focusShadow: `inset 0 0 0 1px ${accents.red}`,
  },
};

const Input = forwardRef(function Input({ variant = 'default', ...rest }, ref) {
  const v = VARIANTS[variant] ?? {};

  return (
    <TextInput
      ref={ref}
      style={[
        BASE,
        variant !== 'default' && { borderColor: v.borderColor },
      ]}
      placeholderTextColor={colors.textMut + '99' /* opacity 0.6 */}
      {...rest}
    />
  );
});

export default Input;
