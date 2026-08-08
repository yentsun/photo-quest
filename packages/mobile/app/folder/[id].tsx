import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

export default function FolderPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#002b36' }}>
      <Text style={{ color: '#839496', fontSize: 18 }}>Folder: {id}</Text>
    </View>
  );
}
