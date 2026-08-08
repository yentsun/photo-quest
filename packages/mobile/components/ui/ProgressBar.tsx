import { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { colors, spacing, radius } from './theme';

interface ProgressBarProps {
  value?: number;
  max?: number;
  width?: number;
  indeterminate?: boolean;
}

export function ProgressBar({ value = 0, max = 100, width = 16, indeterminate = false }: ProgressBarProps) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!indeterminate) {
      Animated.timing(anim, {
        toValue: Math.max(0, Math.min(100, (value / max) * 100)),
        duration: 300,
        useNativeDriver: false,
      }).start();
    } else {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: 1, duration: 1200, useNativeDriver: false }),
          Animated.timing(anim, { toValue: 0, duration: 1200, useNativeDriver: false }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
  }, [value, max, indeterminate, anim]);

  if (indeterminate) {
    const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [-100, 100] });
    return (
      <View style={styles.track}>
        <Animated.View style={[styles.indeterminateFill, { transform: [{ translateX }] }]} />
      </View>
    );
  }

  const pct = Math.max(0, Math.min(100, (value / max) * 100));

  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${pct}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 6,
    backgroundColor: colors.bgHighlight,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
  },
  indeterminateFill: {
    width: '50%',
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
  },
});
