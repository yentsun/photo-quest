import { View, Text } from 'react-native';
import { colors, fontSize } from '../theme/tokens';

export default function LikedPage() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
      <Text style={{ color: colors.textEm, fontSize: fontSize.lg }}>Liked</Text>
      <Text style={{ color: colors.textMut, fontSize: fontSize.sm, marginTop: 8 }}>Coming soon</Text>
    </View>
  );
}
