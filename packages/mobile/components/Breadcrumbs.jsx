import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import Button from './Button';
import { colors, fontSize } from '../theme/tokens';

export default function Breadcrumbs({ items = [] }) {
  const router = useRouter();

  if (!items.length) return null;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
      <Button variant="text" onPress={() => router.push('/')}>Library</Button>
      {items.map((crumb, i) => (
        <View key={crumb.id ?? i} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ color: colors.border, fontSize: fontSize.sm }}>/</Text>
          {crumb.id ? (
            <Button variant="text" onPress={() => router.push(`/folder/${crumb.id}`)}>{crumb.name}</Button>
          ) : (
            <Text style={{ color: colors.textMut, fontSize: fontSize.sm, paddingHorizontal: 8, paddingVertical: 4 }}>{crumb.name}</Text>
          )}
        </View>
      ))}
    </View>
  );
}
