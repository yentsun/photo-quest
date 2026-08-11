import { Pressable, Text } from 'react-native';
import { colors, fontSize, fontFamily, layout, accents } from '../../theme/tokens';

const H = layout.rowHeight;

const BASE = {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  height: H,
  paddingHorizontal: 12,
  borderWidth: 1,
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

const SIZE = {
  sm: { height: 26, paddingHorizontal: 8, gap: 6 },
  lg: { height: 38, paddingHorizontal: 16 },
};

const VARIANTS = {
  '': {
    bg: colors.surface, border: colors.border, text: colors.textEm,
    hoverBg: colors.dim, hoverBorder: colors.textMut, hoverText: colors.textEm,
    pressedBg: colors.border, pressedBorder: colors.textMut, pressedText: colors.textEm,
  },
  primary: {
    bg: colors.accent, border: colors.accent, text: colors.bg,
    hoverBg: '#227dbd', hoverBorder: '#227dbd', hoverText: colors.bg,
    pressedBg: '#227dbd', pressedBorder: '#227dbd', pressedText: colors.bg,
  },
  ghost: {
    bg: 'transparent', border: colors.border, text: colors.text,
    hoverBg: colors.surface, hoverBorder: colors.textMut, hoverText: colors.textEm,
    pressedBg: colors.surface, pressedBorder: colors.textMut, pressedText: colors.textEm,
  },
  danger: {
    bg: 'transparent', border: colors.border, text: accents.red,
    hoverBg: '#3a1d1a', hoverBorder: accents.red, hoverText: accents.red,
    pressedBg: '#3a1d1a', pressedBorder: accents.red, pressedText: accents.red,
  },
  text: {
    bg: 'transparent', border: 'transparent', text: colors.textMut,
    hoverBg: 'transparent', hoverBorder: 'transparent', hoverText: colors.textEm,
    pressedBg: 'transparent', pressedBorder: 'transparent', pressedText: colors.textEm,
  },
};

export default function Button({
  variant = 'primary',
  size = 'md',
  icon,
  children,
  disabled = false,
  onPress,
}) {
  const sz = SIZE[size] ?? {};
  const v = VARIANTS[variant] ?? VARIANTS[''];

  const labelFontSize = sz.fontSize ?? fontSize.base;
  const labelStyle = {
    fontSize: labelFontSize,
    fontFamily: fontFamily.mono,
    lineHeight: labelFontSize * 1.45,
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={(state) => {
        const { pressed, hovered } = state;
        const key = pressed ? 'pressed' : hovered ? 'hover' : null;
        const bg  = key ? v[key + 'Bg'] ?? v.bg : v.bg;
        const bd  = key ? v[key + 'Border'] ?? v.border : v.border;
        const clr = key ? v[key + 'Text'] ?? v.text : v.text;
        const dclr = v.disabledText ?? v.text;
        const finalColor = disabled ? dclr : clr;

        return [
          BASE, sz,
          { backgroundColor: bg, borderColor: bd },
          disabled && { opacity: 0.45 },
        ];
      }}
    >
      {icon}
      {typeof children === 'string'
        ? <Text style={[{ color: v.text }, labelStyle]}>{children}</Text>
        : children}
    </Pressable>
  );
}
