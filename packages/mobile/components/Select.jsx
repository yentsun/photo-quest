import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View, Platform } from 'react-native';
import Button from './Button';
import { colors, fontSize, fontFamily } from '../theme/tokens';

const MENU_TOP = 26 + 6;

export default function Select({ value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const selected = options.find((o) => o.value === value);
  const label = selected?.label ?? value;

  useEffect(() => {
    if (!open) return;
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const onDocDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDocDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDocDown);
    };
  }, [open]);

  return (
    <View ref={wrapRef} style={{ position: 'relative' }}>
      <Button variant="ghost" size="sm" onPress={() => setOpen((o) => !o)}>
        <Text style={{ color: colors.textEm, fontSize: fontSize.xs, fontFamily: fontFamily.mono }} numberOfLines={1}>
          {label}
        </Text>
        <Text
          style={{
            color: colors.textMut,
            fontSize: fontSize.xs,
            lineHeight: fontSize.xs,
            transform: [{ rotate: open ? '180deg' : '0deg' }],
          }}
        >
          ▾
        </Text>
      </Button>

      {open && (
        <View
          style={{
            position: 'absolute',
            top: MENU_TOP,
            right: 0,
            zIndex: 60,
            minWidth: '100%',
            backgroundColor: colors.bg,
            borderWidth: 1,
            borderColor: colors.textMut,
            padding: 5,
            shadowColor: '#002b36',
            shadowOffset: { width: 0, height: 10 },
            shadowRadius: 28,
            shadowOpacity: 0.22,
            elevation: 8,
          }}
        >
          {options.map(({ value: v, label: l }) => (
            <Pressable
              key={v}
              onPress={() => { onChange(v); setOpen(false); }}
              style={({ hovered }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 9,
                paddingVertical: 6,
                paddingHorizontal: 8,
                backgroundColor: hovered ? colors.surface : 'transparent',
              })}
            >
              <Text
                style={{
                  flex: 1,
                  color: v === value ? colors.textEm : colors.text,
                  fontSize: fontSize.base,
                  fontFamily: fontFamily.mono,
                }}
              >
                {l}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
