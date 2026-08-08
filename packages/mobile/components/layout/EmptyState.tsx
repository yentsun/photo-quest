import { View, Text, StyleSheet } from 'react-native';
import { Button } from '../ui/Button';
import { colors, spacing, fontSize } from '../ui/theme';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  icon?: ReactNode;
}

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.desc}>{description}</Text> : null}
      {action ? <Button variant="primary" onPress={action.onClick}>{action.label}</Button> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: spacing.md,
  },
  icon: {
    marginBottom: spacing.md,
    opacity: 0.6,
  },
  title: {
    color: colors.fg,
    fontSize: fontSize.xl,
    fontFamily: 'monospace',
    fontWeight: '600',
    textAlign: 'center',
  },
  desc: {
    color: colors.fgDim,
    fontSize: fontSize.sm,
    fontFamily: 'monospace',
    textAlign: 'center',
    maxWidth: 400,
  },
});
