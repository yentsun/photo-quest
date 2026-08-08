import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Video, ResizeMode, type AVPlaybackStatus } from 'expo-av';
import { Loader } from '../ui/Loader';
import { colors, fontSize } from '../ui/theme';

interface MediaPlayerProps {
  src: string;
  title?: string;
  autoPlay?: boolean;
  onEnded?: () => void;
}

export const MediaPlayer = forwardRef(function MediaPlayer(
  { src, title = '', autoPlay = true, onEnded }: MediaPlayerProps,
  ref
) {
  const videoRef = useRef<Video>(null);
  const [buffering, setBuffering] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [renderedSrc, setRenderedSrc] = useState(src);

  if (src !== renderedSrc) {
    setRenderedSrc(src);
    setBuffering(true);
  }

  useImperativeHandle(ref, () => ({
    togglePlay() {
      videoRef.current?.getStatusAsync().then((status) => {
        if (!status.isLoaded) return;
        if (status.isPlaying) {
          videoRef.current?.pauseAsync();
        } else {
          videoRef.current?.playAsync();
        }
      });
    },
    getCurrentTime() {
      return videoRef.current?.getStatusAsync().then((status) =>
        status.isLoaded ? (status as any).positionMillis / 1000 : 0
      );
    },
  }));

  const handlePlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    if (status.isBuffering) {
      setBuffering(true);
    } else {
      setBuffering(false);
    }
    if (status.didJustFinish) {
      onEnded?.();
    }
  };

  return (
    <View style={styles.container}>
      {buffering && !error && (
        <View style={styles.overlay}>
          <Loader message={title ? `Buffering "${title}"...` : 'Buffering...'} />
        </View>
      )}
      {error && (
        <View style={styles.overlay}>
          <Text style={styles.error}>{error}</Text>
        </View>
      )}
      <Video
        ref={videoRef}
        source={{ uri: src }}
        style={styles.video}
        useNativeControls
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay={autoPlay}
        isLooping
        onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
        onError={() => {
          setBuffering(false);
          setError('This video could not be played.');
        }}
      />
    </View>
  );
});

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
  video: {
    flex: 1,
  },
  error: {
    color: colors.red,
    fontSize: fontSize.sm,
    fontFamily: 'monospace',
  },
});
