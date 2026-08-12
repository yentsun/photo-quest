import { View, Platform, AppState } from 'react-native';
import { Stack } from 'expo-router';
import { useEffect, useRef } from 'react';
import { GlobalProvider } from '../contexts/GlobalContext';
import { RefreshProvider } from '../contexts/RefreshContext';
import { ScanProvider } from '../contexts/ScanContext';
import { SlideshowProvider, useSlideshow } from '../contexts/SlideshowContext';
import { JobProgressProvider } from '../contexts/JobProgressContext';
import { PlaylistProvider } from '../contexts/PlaylistContext';
import Sidebar from '../components/Sidebar';
import CRTOverlay from '../components/CRTOverlay';
import { colors } from '../theme/tokens';

function AppStateHandler() {
  const appState = useRef(AppState.currentState);
  const { active: slideshowActive, stop: stopSlideshow } = useSlideshow();

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/active/) && nextState.match(/inactive|background/)) {
        if (slideshowActive) stopSlideshow();
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, [slideshowActive, stopSlideshow]);

  return null;
}

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (window.location.port && window.location.port !== '8081') {
      navigator.serviceWorker?.register('/sw.js');
    }
  }, []);

  return (
    <GlobalProvider>
      <RefreshProvider>
        <ScanProvider>
          <SlideshowProvider>
            <PlaylistProvider>
              <JobProgressProvider>
                <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.bg }}>
                  <CRTOverlay />
                  <Sidebar />
                  <View style={{ flex: 1 }}>
                    <AppStateHandler />
                    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
                      <Stack.Screen name="index" />
                      <Stack.Screen name="liked" />
                      <Stack.Screen name="folder/[id]" />
                      <Stack.Screen name="media/[id]" />
                      <Stack.Screen name="tags/index" />
                      <Stack.Screen name="tags/[tag]" />
                    </Stack>
                  </View>
                </View>
              </JobProgressProvider>
            </PlaylistProvider>
          </SlideshowProvider>
        </ScanProvider>
      </RefreshProvider>
    </GlobalProvider>
  );
}
