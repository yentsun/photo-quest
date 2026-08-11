/**
 * @file Phase 0 placeholder screen.
 *
 * Proves the infra wiring end-to-end: Expo + react-native-web + expo-router
 * booting inside the pnpm monorepo and talking to the kojo API server via the
 * canonical route map from @photo-quest/shared. Zero design — the real UI
 * arrives in Phases 1–4 (see issue #27).
 */
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { apiRoutes } from '@photo-quest/shared';
import { getApiBaseUrl } from '../services/baseUrl';

export default function Index() {
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${getApiBaseUrl()}${apiRoutes.media}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const total = Array.isArray(data) ? data.length : (data.total ?? data.items?.length ?? 0);
        if (!cancelled) setState({ status: 'ok', total });
      } catch (err) {
        if (!cancelled) setState({ status: 'error', message: err.message });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Photo Quest — mobile shell</Text>
      <Text style={styles.line}>packages/mobile · Phase 0 placeholder (no design yet)</Text>
      {state.status === 'loading' && <Text style={styles.line}>Contacting API server…</Text>}
      {state.status === 'ok' && (
        <Text style={styles.line}>GET {apiRoutes.media} → {state.total} media items</Text>
      )}
      {state.status === 'error' && (
        <Text style={styles.line}>API unreachable: {state.message} (is `pnpm dev:server` running?)</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  title: { fontSize: 16, fontWeight: '600' },
  line: { fontSize: 13, textAlign: 'center' },
});
