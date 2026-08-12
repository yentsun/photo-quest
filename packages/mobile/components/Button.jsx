import { useState, cloneElement, isValidElement } from 'react';
import { Pressable, Text } from 'react-native';
import { colors, fontSize, fontFamily, layout, accents, space } from '../theme/tokens';

const H = layout.rowHeight;

const BASE = {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: space.gap,
  height: H,
  paddingHorizontal: 12,
  borderWidth: 1,
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

const SIZE = {
  sm: { height: 26, paddingHorizontal: 8, gap: 6, fontSize: 11 },
  lg: { height: 38, paddingHorizontal: 16 },
};

const VARIANTS = {
  '': {
    bg: colors.surface, border: colors.border, text: colors.textEm, icon: colors.textMut,
    hoverBg: colors.dim, hoverBorder: colors.textMut, hoverText: colors.textEm, hoverIcon: colors.textEm,
    pressedBg: colors.border, pressedBorder: colors.textMut, pressedText: colors.textEm, pressedIcon: colors.textEm,
  },
  primary: {
    bg: colors.accent, border: colors.accent, text: colors.bg, icon: colors.bg,
    hoverBg: '#227dbd', hoverBorder: '#227dbd', hoverText: colors.bg, hoverIcon: colors.bg,
    pressedBg: '#227dbd', pressedBorder: '#227dbd', pressedText: colors.bg, pressedIcon: colors.bg,
  },
  ghost: {
    bg: 'transparent', border: colors.border, text: colors.text, icon: colors.textMut,
    hoverBg: colors.surface, hoverBorder: colors.textMut, hoverText: colors.textEm, hoverIcon: colors.textEm,
    pressedBg: colors.surface, pressedBorder: colors.textMut, pressedText: colors.textEm, pressedIcon: colors.textEm,
  },
  danger: {
    bg: 'transparent', border: colors.border, text: accents.red, icon: accents.red,
    hoverBg: '#3a1d1a', hoverBorder: accents.red, hoverText: accents.red, hoverIcon: accents.red,
    pressedBg: '#3a1d1a', pressedBorder: accents.red, pressedText: accents.red, pressedIcon: accents.red,
  },
  text: {
    bg: 'transparent', border: 'transparent', text: colors.textMut, icon: colors.textMut,
    hoverBg: 'transparent', hoverBorder: 'transparent', hoverText: colors.textEm, hoverIcon: colors.textEm,
    pressedBg: 'transparent', pressedBorder: 'transparent', pressedText: colors.textEm, pressedIcon: colors.textEm,
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
  const [interact, setInteract] = useState(null);
  const sz = SIZE[size] ?? {};
  const v = VARIANTS[variant] ?? VARIANTS[''];

  const key = interact;
  const bg  = key ? v[key + 'Bg'] ?? v.bg : v.bg;
  const bd  = key ? v[key + 'Border'] ?? v.border : v.border;
  const textColor = disabled ? (v.disabledText ?? v.text) : key ? v[key + 'Text'] ?? v.text : v.text;
  const baseIconColor = disabled ? (v.disabledIcon ?? v.icon) : v.icon;
  const iconColor = key ? (v[key + 'Icon'] ?? baseIconColor) : (icon?.props?.color ?? baseIconColor);

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
      onHoverIn={() => setInteract('hover')}
      onHoverOut={() => setInteract(null)}
      onPressIn={() => setInteract('pressed')}
      onPressOut={() => setInteract(null)}
      style={[
        BASE, sz,
        { backgroundColor: bg, borderColor: bd },
        disabled && { opacity: 0.45 },
      ]}
    >
      {isValidElement(icon) ? cloneElement(icon, { color: iconColor }) : icon}
      {typeof children === 'string'
        ? <Text style={[{ color: textColor }, labelStyle]}>{children}</Text>
        : children}
    </Pressable>
  );
}
