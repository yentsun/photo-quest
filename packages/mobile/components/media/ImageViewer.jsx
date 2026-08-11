import { useState } from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import Loader from '../ui/Loader';
import { colors, fontSize } from '../../theme/tokens';

export default function ImageViewer({ src, alt = '' }) {
  const [status, setStatus] = useState('loading');

  return (
    <View style={{ position: 'relative', flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      {status === 'loading' && (
        <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
          <Loader message={alt ? `"${alt}"…` : null} />
        </View>
      )}
      {status === 'error' && (
        <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.textMut, fontSize: fontSize.sm }}>Failed to load image</Text>
        </View>
      )}
      <Image
        source={{ uri: src }}
        style={{ maxWidth: '100%', maxHeight: '100%' }}
        contentFit="contain"
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
      />
    </View>
  );
}
