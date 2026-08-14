import { useEffect, useState } from 'react';
import { View, Text, Image } from 'react-native';
import { colors, fontSize } from '../theme/tokens';
import Loader from './Loader';

export default function ImageViewer({ src, alt = '' }) {
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setError(false);
    setLoading(true);
  }, [src]);

  return (
    <>
      {error && (
        <View style={{ position: 'absolute', inset: 0, zIndex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }}>
          <Text style={{ color: colors.textMut, fontSize: fontSize.sm }}>Failed to load image</Text>
        </View>
      )}
      {loading && !error && (
        <View style={{ position: 'absolute', inset: 0, zIndex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }}>
          <Loader message={alt ? `Loading "${alt}"…` : 'Loading…'} />
        </View>
      )}
      <Image
        source={{ uri: src }}
        style={{ flex: 1, alignSelf: 'stretch' }}
        resizeMode="contain"
        onLoad={() => setLoading(false)}
        onError={() => { setError(true); setLoading(false); }}
      />
    </>
  );
}
