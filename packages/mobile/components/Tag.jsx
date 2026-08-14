import { View, Text, Pressable } from 'react-native';
import { colors, fontSize, fontFamily } from '../theme/tokens';

export default function Tag({ label, onPress, onRemove, muted = false }) {
  return (
    <View style={{ height: 20, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
      <Pressable onPress={onPress} disabled={!onPress} style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text selectable={false} style={{ fontSize: fontSize.xs, lineHeight: 14, fontFamily: fontFamily.mono, color: muted ? colors.textMut : colors.text }}>{label}</Text>
      </Pressable>
      {onRemove && (
        <Pressable onPress={onRemove}>
          <Text selectable={false} style={{ color: colors.textMut, fontSize: 14, lineHeight: 14 }}>×</Text>
        </Pressable>
      )}
    </View>
  );
}
