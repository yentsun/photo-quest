import { useState } from 'react';
import { View, Text, Image } from 'react-native';
import { colors, fontSize } from '../theme/tokens';

export default function ImageViewer({ src, alt = '' }) {
  const [error, setError] = useState(false);

  return (
    <>
      {error && (
        <View style={{ position: 'absolute', inset: 0, zIndex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }}>
          <Text style={{ color: colors.textMut, fontSize: fontSize.sm }}>Failed to load image</Text>
        </View>
      )}
      <Image
        source={{ uri: src }}
        style={{ flex: 1, alignSelf: 'stretch' }}
        resizeMode="contain"
        onError={() => setError(true)}
      />
    </>
  );
}
