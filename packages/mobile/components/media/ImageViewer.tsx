import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Loader } from '../ui/Loader';
import { colors, spacing, fontSize } from '../ui/theme';

interface ImageViewerProps {
  src: string;
  alt?: string;
}

export function ImageViewer({ src, alt = '' }: ImageViewerProps) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [renderedSrc, setRenderedSrc] = useState(src);

  if (src !== renderedSrc) {
    setRenderedSrc(src);
    setStatus('loading');
  }

  return (
    <View style={styles.container}>
      {status === 'loading' && (
        <View style={styles.overlay}>
          <Loader message={alt} />
        </View>
      )}
      {status === 'error' && (
        <View style={styles.overlay}>
          <Text style={styles.error}>Failed to load image</Text>
        </View>
      )}
      <Image
        source={{ uri: src }}
        style={[styles.image, status !== 'loaded' && styles.hidden]}
        contentFit="contain"
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  image: {
    flex: 1,
  },
  hidden: {
    opacity: 0,
  },
  error: {
    color: colors.red,
    fontSize: fontSize.sm,
    fontFamily: 'monospace',
  },
});
