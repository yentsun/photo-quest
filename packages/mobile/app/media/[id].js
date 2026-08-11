import { View, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { colors, fontSize } from '../../theme/tokens';

export default function MediaPage() {
  const { id } = useLocalSearchParams();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }}>
      <Text style={{ color: colors.textEm, fontSize: fontSize.lg }}>Media {id}</Text>
      <Text style={{ color: colors.textMut, fontSize: fontSize.sm, marginTop: 8 }}>Viewer coming in Phase 5</Text>
    </View>
  );
}
