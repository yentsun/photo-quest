import { Pressable, View } from 'react-native';
import { colors } from '../../theme/tokens';

const SIZES = {
  sm: 160,
  md: 200,
  lg: 240,
};

export default function Card({ children, onPress, size = 'md', style }) {
  const width = typeof size === 'number' ? size : (SIZES[size] ?? SIZES.md);

  return (
    <Pressable
      onPress={onPress}
      style={({ hovered }) => ({
        width,
        borderWidth: 1,
        borderColor: hovered ? colors.textMut : colors.border,
        backgroundColor: colors.surface,
        overflow: 'hidden',
        flexDirection: 'column',
        ...style,
      })}
    >
      {children}
    </Pressable>
  );
}

function ImageArea({ children, style }) {
  return (
    <View style={[{ aspectRatio: 4 / 3, backgroundColor: colors.dim, position: 'relative', overflow: 'hidden' }, style]}>
      {children}
    </View>
  );
}

function Footer({ children, style }) {
  return (
    <View style={[{ padding: 6, paddingHorizontal: 10, borderTopWidth: 1, borderColor: colors.border }, style]}>
      {children}
    </View>
  );
}

Card.ImageArea = ImageArea;
Card.Footer = Footer;
