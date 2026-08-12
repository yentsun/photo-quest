import { Text, View } from 'react-native';
import { colors, fontSize, fontFamily, accents } from '../theme/tokens';

const VARIANTS = {
  default: {
    bg:     colors.surface,
    border: colors.border,
    text:   colors.textEm,
  },
  primary: {
    bg:     '#0a3a52',
    border: '#1d5e82',
    text:   accents.blue,
  },
  success: {
    bg:     '#16331f',
    border: '#2c5a30',
    text:   accents.green,
  },
  warning: {
    bg:     '#34300f',
    border: '#5a4f1c',
    text:   accents.yellow,
  },
  error: {
    bg:     '#3a1d1a',
    border: '#6a2a26',
    text:   accents.red,
  },
};

export default function Badge({ count, variant = 'default' }) {
  const v = VARIANTS[variant] ?? VARIANTS.default;

  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 7,
      paddingVertical: 1,
      backgroundColor: v.bg,
      borderWidth: 1,
      borderColor: v.border,
    }}>
      <Text style={{ color: v.text, fontSize: fontSize.xs, fontFamily: fontFamily.mono, letterSpacing: 0.02 * fontSize.xs }}>
        {count}
      </Text>
    </View>
  );
}
