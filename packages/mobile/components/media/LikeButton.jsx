import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { Icon } from '../ui';
import { colors, fontSize } from '../../theme/tokens';

const SIZES = {
  sm: { width: 32, height: 32, icon: 'sm' },
  md: { width: 40, height: 40, icon: 'md' },
  lg: { width: 48, height: 48, icon: 'lg' },
};

export default function LikeButton({ count = 0, onLike, size = 'md' }) {
  const [animating, setAnimating] = useState(false);
  const s = SIZES[size] ?? SIZES.md;
  const hasLikes = count > 0;

  const handlePress = () => {
    setAnimating(true);
    setTimeout(() => setAnimating(false), 300);
    onLike?.();
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ hovered }) => ({
        width: s.width, height: s.height,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: hovered ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.5)',
      })}
    >
      <Icon
        name="heart"
        size={s.icon}
        color={hasLikes ? colors.accent : '#fff'}
      />
      {count > 0 && (
        <Text style={{ color: '#fff', fontSize: fontSize.xs, fontWeight: '500', marginTop: -1 }}>
          {count > 999 ? '999+' : count}
        </Text>
      )}
    </Pressable>
  );
}
