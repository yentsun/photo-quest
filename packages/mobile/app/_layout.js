import { View, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { GlobalProvider } from '../contexts/GlobalContext';
import { RefreshProvider } from '../contexts/RefreshContext';
import { ScanProvider } from '../contexts/ScanContext';
import { SlideshowProvider } from '../contexts/SlideshowContext';
import { JobProgressProvider } from '../contexts/JobProgressContext';
import { Sidebar } from '../components/layout';
import { colors } from '../theme/tokens';

function CRT() {
  return (
    <>
      <View
        style={{
          position: 'absolute', inset: 0, zIndex: 100,
          pointerEvents: 'none',
          ...(typeof window === 'undefined' ? {} : {
            backgroundImage: 'repeating-linear-gradient(to bottom, rgba(0,0,0,0.18) 0px, rgba(0,0,0,0.18) 1px, transparent 1px, transparent 3px)',
          }),
        }}
      />
      <View
        style={{
          position: 'absolute', inset: 0, zIndex: 100,
          pointerEvents: 'none',
          ...(typeof window === 'undefined' ? {} : {
            backgroundImage: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.4) 100%)',
          }),
        }}
      />
    </>
  );
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
            <JobProgressProvider>
              <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.bg }}>
                <CRT />
                <Sidebar />
                <View style={{ flex: 1 }}>
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
          </SlideshowProvider>
        </ScanProvider>
      </RefreshProvider>
    </GlobalProvider>
  );
}
