import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

export default function TagPage() {
  const { tag } = useLocalSearchParams<{ tag: string }>();
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#002b36' }}>
      <Text style={{ color: '#839496', fontSize: 18 }}>Tag: {tag}</Text>
    </View>
  );
}
