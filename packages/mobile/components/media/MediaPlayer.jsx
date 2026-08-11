import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { View, Text, Platform } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import Loader from '../ui/Loader';
import { colors, fontSize } from '../../theme/tokens';

const MediaPlayer = forwardRef(function MediaPlayer({ src, title = '', onEnded }, ref) {
  const [buffering, setBuffering] = useState(true);
  const [error, setError] = useState(null);

  const player = useVideoPlayer(src, player => {
    player.loop = true;
    player.play();
    player.addListener('statusChange', (status, error) => {
      if (status === 'readyToPlay') setBuffering(false);
      if (status === 'error') { setBuffering(false); setError('This video could not be played.'); }
    });
    player.addListener('playingChange', ({ isPlaying }) => {
      setBuffering(!isPlaying && !error);
    });
  });

  useImperativeHandle(ref, () => ({
    togglePlay() {
      if (player.playing) player.pause();
      else player.play();
    },
    getCurrentTime() { return player.currentTime; },
  }));

  return (
    <View style={{ position: 'relative', flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }}>
      {buffering && !error && (
        <View style={{ position: 'absolute', inset: 0, zIndex: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }}>
          <Loader message={title ? `Buffering "${title}"…` : 'Buffering…'} />
        </View>
      )}
      {error && (
        <View style={{ position: 'absolute', inset: 0, zIndex: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }}>
          <Text style={{ color: colors.accent, fontSize: fontSize.sm }}>{error}</Text>
        </View>
      )}
      <VideoView style={{ flex: 1, width: '100%' }} player={player} nativeControls />
    </View>
  );
});

export default MediaPlayer;
