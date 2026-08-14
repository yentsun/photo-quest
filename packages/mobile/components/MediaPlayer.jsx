import { forwardRef, useImperativeHandle, useState } from 'react';
import { View, Text } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import Loader from './Loader';
import ProgressBar from './ProgressBar';
import { colors, fontSize } from '../theme/tokens';

const MediaPlayer = forwardRef(function MediaPlayer({ src, title = '' }, ref) {
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [buffered, setBuffered] = useState(0);
  const [duration, setDuration] = useState(0);

  const player = useVideoPlayer(src, player => {
    player.loop = true;
    player.play();
    player.timeUpdateEventInterval = 0.5;
    player.addListener('statusChange', ({ status: s, error: e }) => {
      setStatus(s);
      if (s === 'error') setError('This video could not be played.');
    });
    player.addListener('timeUpdate', ({ bufferedPosition }) => {
      const dur = player.duration;
      if (dur > 0) {
        setDuration(dur);
        setBuffered(Math.max(0, Math.min(1, bufferedPosition / dur)));
      }
    });
  });

  const buffering = !error && status !== 'readyToPlay';

  useImperativeHandle(ref, () => ({
    togglePlay() {
      if (player.playing) player.pause();
      else player.play();
    },
    getCurrentTime() { return player.currentTime; },
  }));

  return (
    <View style={{ position: 'relative', flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }}>
      {buffering && (
        <View style={{ position: 'absolute', inset: 0, zIndex: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', gap: 14 }}>
          <Loader message={title ? `Buffering "${title}"…` : 'Buffering…'} />
          {duration > 0 && (
            <ProgressBar value={buffered * 100} max={100} width={20} variant="light" />
          )}
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
