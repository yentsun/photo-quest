import { View, Text } from 'react-native';
import Button from './Button';
import { colors, fontSize } from '../theme/tokens';

export default function EmptyState({ title, description, action, icon }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: '40vh', padding: 16, gap: 8 }}>
      {icon && <View style={{ marginBottom: 8 }}>{icon}</View>}
      <Text style={{ fontSize: fontSize.lg, fontWeight: '600', color: colors.textEm }}>{title}</Text>
      {description && <Text style={{ color: colors.textMut, fontSize: fontSize.sm, maxWidth: 360, marginBottom: 16, textAlign: 'center' }}>{description}</Text>}
      {action && <Button onPress={action.onPress} variant="primary">{action.label}</Button>}
    </View>
  );
}
