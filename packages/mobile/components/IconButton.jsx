import { Pressable } from 'react-native';
import { colors, layout } from '../theme/tokens';

const H = layout.rowHeight;

const BASE = {
  alignItems: 'center',
  justifyContent: 'center',
  width: H,
  height: H,
  padding: 0,
  backgroundColor: 'transparent',
  borderWidth: 1,
  borderColor: 'transparent',
  cursor: 'pointer',
  flexShrink: 0,
};

const SIZE = {
  sm: { width: 26, height: 26 },
  lg: { width: 42, height: 42 },
};

const VARIANTS = {
  default: {
    bg: 'transparent', border: 'transparent', color: colors.textMut,
    hoverBg: colors.surface, hoverBorder: colors.border, hoverColor: colors.textEm,
  },
  overlay: {
    bg: 'rgba(0,0,0,0.5)', border: 'transparent', color: 'rgba(255,255,255,0.7)',
    hoverBg: 'rgba(0,0,0,0.75)', hoverBorder: 'transparent', hoverColor: '#fff',
  },
};

export default function IconButton({
  icon,
  label,
  variant = 'default',
  size = 'md',
  disabled = false,
  onPress,
}) {
  const sz = SIZE[size] ?? {};
  const v = VARIANTS[variant] ?? VARIANTS.default;

  return (
    <Pressable
      aria-label={label}
      accessibilityLabel={label}
      title={label}
      disabled={disabled}
      onPress={onPress}
      style={(state) => {
        const { pressed, hovered } = state;
        const bg = disabled ? v.disabledBg ?? v.bg : pressed ? v.pressedBg ?? v.bg : hovered ? v.hoverBg ?? v.bg : v.bg;
        const bd = disabled ? v.disabledBorder ?? v.border : pressed ? v.pressedBorder ?? v.border : hovered ? v.hoverBorder ?? v.border : v.border;
        const cl = disabled ? v.disabledColor ?? v.color : pressed ? v.pressedColor ?? v.color : hovered ? v.hoverColor ?? v.color : v.color;

        return [
          BASE, sz,
          { backgroundColor: bg, borderColor: bd },
          { color: cl },
          disabled && { opacity: 0.45, cursor: 'not-allowed', pointerEvents: 'none' },
        ];
      }}
    >
      {icon}
    </Pressable>
  );
}
