import { View, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { colors, fontSize } from '../../theme/tokens';

export default function FolderPage() {
  const { id } = useLocalSearchParams();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
      <Text style={{ color: colors.textEm, fontSize: fontSize.lg }}>Folder {id}</Text>
      <Text style={{ color: colors.textMut, fontSize: fontSize.sm, marginTop: 8 }}>Coming in next pass</Text>
    </View>
  );
}
