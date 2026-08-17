import { useEffect, useRef } from 'react';
import { Animated, Text } from 'react-native';
import Icon from './Icon';
import { accents, fontSize } from '../theme/tokens';

export default function LikeFlash({ count, onDone }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    let mounted = true;
    const t = setTimeout(() => {
      if (!mounted) return;
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1.1, duration: 500, useNativeDriver: true }),
      ]).start(({ finished }) => { if (finished) onDone?.(); });
    }, 550);

    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 140, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
    ]).start();

    return () => { mounted = false; clearTimeout(t); };
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        alignItems: 'center', justifyContent: 'center', gap: 4,
        opacity, transform: [{ scale }], pointerEvents: 'none',
      }}
    >
      <Icon name="heart-filled" size="xl" color={accents.red} />
      <Text style={{ color: '#fff', fontSize: fontSize.md, fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 6 }}>{count}</Text>
    </Animated.View>
  );
}
