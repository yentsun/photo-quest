import { useEffect, useRef } from 'react';
import { View, Text, Animated } from 'react-native';
import { colors, fontSize, fontFamily } from '../../theme/tokens';
import { SPINNER_BLINK } from '../../theme/presets';

export default function Loader({ message }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: SPINNER_BLINK.duration / 2, useNativeDriver: false }),
        Animated.timing(anim, { toValue: 0, duration: SPINNER_BLINK.duration / 2, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  const bgColor = anim.interpolate({ inputRange: [0, 1], outputRange: [colors.textEm, 'transparent'] });

  return (
    <View style={{ flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        <Text style={{ fontFamily: fontFamily.mono, fontSize: fontSize.xl, color: colors.textMut }}>
          Loading...
        </Text>
        <Animated.View style={{
          display: 'inline-block',
          height: '0.85em',
          width: '0.35em',
          backgroundColor: bgColor,
        }} />
      </View>
      {message && (
        <Text style={{ color: colors.textMut, fontSize: fontSize.sm, fontFamily: fontFamily.mono }}>
          {message}
        </Text>
      )}
    </View>
  );
}
