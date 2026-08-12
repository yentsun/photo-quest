import { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import { colors, fontSize } from '../theme/tokens';

const SCAN_WIDTH = 3;

export default function ProgressBar({
  value = 0,
  max = 100,
  width = 16,
  brackets = true,
  showPct = true,
  indeterminate = false,
  variant,
}) {
  const [scanPos, setScanPos] = useState(0);

  useEffect(() => {
    if (!indeterminate) return;
    const id = setInterval(() => setScanPos((p) => (p + 1) % width), 80);
    return () => clearInterval(id);
  }, [indeterminate, width]);

  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const onCount = indeterminate ? null : Math.round((pct / 100) * width);

  const isLight = variant === 'light';
  const brkColor  = isLight ? 'rgba(255,255,255,0.45)' : colors.textMut;
  const cellBg    = isLight ? 'rgba(255,255,255,0.18)' : colors.border;
  const cellOnBg  = isLight ? 'rgba(255,255,255,0.85)' : colors.accent;
  const pctColor  = isLight ? 'rgba(255,255,255,0.6)' : colors.textMut;

  const cells = Array.from({ length: width }, (_, i) => {
    const lit = indeterminate
      ? (i >= scanPos && i < scanPos + SCAN_WIDTH) ||
        (scanPos + SCAN_WIDTH > width && i < (scanPos + SCAN_WIDTH) % width)
      : i < onCount;
    return (
      <View
        key={i}
        style={[{ width: 6, height: 11, backgroundColor: cellBg }, lit && { backgroundColor: cellOnBg }]}
      />
    );
  });

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {brackets && <Text style={{ color: brkColor }}>[</Text>}
      <View style={{ flexDirection: 'row', gap: 1, marginHorizontal: 2 }}>{cells}</View>
      {brackets && <Text style={{ color: brkColor }}>]</Text>}
      {showPct && !indeterminate && (
        <Text style={{ color: pctColor, marginLeft: 6 }}>{Math.round(pct)}%</Text>
      )}
    </View>
  );
}
