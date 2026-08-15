import { useRef } from 'react';
import { Pressable, Text, Animated } from 'react-native';
import Icon from './Icon';
import { accents, colors, fontSize } from '../theme/tokens';

const SIZES = {
  sm: { width: 32, height: 32, icon: 'sm' },
  md: { width: 40, height: 40, icon: 'md' },
  lg: { width: 48, height: 48, icon: 'lg' },
};

export default function LikeButton({ count = 0, onLike, size = 'md', overlay = false, height, disabled = false }) {
  const scale = useRef(new Animated.Value(1)).current;
  const s = SIZES[size] ?? SIZES.md;
  const hasLikes = count > 0;

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.3, duration: 100, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();
    onLike?.();
  };

  return (
    <Pressable
      onPress={disabled ? undefined : handlePress}
      style={({ hovered }) => ({
        width: height ?? s.width, height: height ?? s.height,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: overlay ? (hovered ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.65)') : (hovered ? colors.surface : 'transparent'),
        borderWidth: overlay ? 0 : 1,
        borderColor: hovered ? colors.textMut : colors.border,
      })}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Icon
          name={hasLikes ? 'heart-filled' : 'heart'}
          size={s.icon}
          color={hasLikes ? accents.red : colors.textMut}
        />
      </Animated.View>
      {count > 0 && (
        <Text selectable={false} style={{ color: overlay ? '#fff' : (hasLikes ? accents.red : colors.textMut), fontSize: fontSize.xs, fontWeight: '500', marginTop: -1 }}>
          {count > 999 ? '999+' : count}
        </Text>
      )}
    </Pressable>
  );
}
