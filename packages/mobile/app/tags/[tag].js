import { View, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { colors, fontSize } from '../../theme/tokens';

export default function TagPage() {
  const { tag } = useLocalSearchParams();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
      <Text style={{ color: colors.textEm, fontSize: fontSize.lg }}>Tag: {tag}</Text>
      <Text style={{ color: colors.textMut, fontSize: fontSize.sm, marginTop: 8 }}>Coming soon</Text>
    </View>
  );
}
