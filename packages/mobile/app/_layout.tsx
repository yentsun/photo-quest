import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GlobalProvider } from '../contexts/GlobalContext';
import { RefreshProvider } from '../contexts/RefreshContext';
import { ScanProvider } from '../contexts/ScanContext';
import { JobProgressProvider } from '../contexts/JobProgressContext';
import { SlideshowProvider } from '../contexts/SlideshowContext';
import { ErrorBoundary } from '../components/ErrorBoundary';

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <GlobalProvider>
        <RefreshProvider>
          <ScanProvider>
            <JobProgressProvider>
              <SlideshowProvider>
                <StatusBar style="light" />
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="index" />
                  <Stack.Screen name="dashboard" />
                  <Stack.Screen name="liked" />
                  <Stack.Screen name="folder/[id]" />
                  <Stack.Screen name="media/[id]" />
                  <Stack.Screen name="tags" />
                  <Stack.Screen name="tags/[tag]" />
                </Stack>
              </SlideshowProvider>
            </JobProgressProvider>
          </ScanProvider>
        </RefreshProvider>
      </GlobalProvider>
    </ErrorBoundary>
  );
}
